import {
  MAP_CITIES,
  summarizeLandForecast,
  mergeLandMorningAfternoonWeather,
  computeLandPublishHighlights,
  type City,
  type CityWeather,
  type DailyWeather,
  type LandFcstItem,
  type LandSlotValue,
} from "./kma";

function toWeatherLabelLike(value: string | null) {
  return value as
    | "맑음"
    | "구름조금"
    | "구름많음"
    | "흐림"
    | "차차흐림"
    | "흐린후갬"
    | "비"
    | "흐린후비"
    | "비후갬"
    | "눈"
    | "비나눈"
    | null;
}

function kmaApiOrigin(): string {
  if (import.meta.env.DEV) {
    return `${window.location.origin}/__proxy/kma`;
  }
  return "https://apis.data.go.kr";
}

const LAND_BASE_URL =
  `${kmaApiOrigin()}/1360000/VilageFcstMsgService/getLandFcst`;
const LAND_OVERVIEW_BASE_URL =
  `${kmaApiOrigin()}/1360000/VilageFcstMsgService/getWthrSituation`;
const REQUEST_TIMEOUT_MS = 12000;
const CONCURRENCY = 5;
const LAND_OVERVIEW_STN_ID = "108";

type WeatherWarning = {
  city: string;
  message: string;
};

type WeatherCityData = CityWeather;

type CityForecastResult = WeatherCityData & {
  announceTime: string | null;
};

export type WeatherResult = {
  base: { baseDate: string; baseTime: string };
  updatedAt: string;
  landOverviewText: string;
  tomorrowNationalTempRangeText: string;
  data: WeatherCityData[];
  warnings: WeatherWarning[];
};

type StoredTomorrowRow = {
  city: string;
  tomorrow: DailyWeather;
  dayAfterTomorrow: DailyWeather;
  threeDaysLater: DailyWeather;
};

type StoredMapHighlightBaseline = {
  date: string;
  rows: StoredTomorrowRow[];
};

const MAP_BASELINE_LOCAL_KEY_PREFIX = "kma:map-baseline:";

function localBaselineKey(baseDate: string) {
  return `${MAP_BASELINE_LOCAL_KEY_PREFIX}${baseDate}`;
}

function readLocalBaseline(baseDate: string): StoredMapHighlightBaseline | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(localBaselineKey(baseDate));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredMapHighlightBaseline;
    if (!parsed || typeof parsed.date !== "string" || !Array.isArray(parsed.rows)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeLocalBaseline(payload: StoredMapHighlightBaseline) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(localBaselineKey(payload.date), JSON.stringify(payload));
  } catch {
    // 로컬 저장 실패는 하이라이트 동작을 막지 않음
  }
}

function isLikelyEncodedKey(value: string) {
  return /%[0-9A-Fa-f]{2}/.test(value);
}

function normalizeServiceKey(rawKey: string) {
  return rawKey.trim();
}

async function fetchWithTimeout(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
    });
  } finally {
    clearTimeout(timeout);
  }
}

function buildLandRequestUrl({
  serviceKey,
  regId,
}: {
  serviceKey: string;
  regId: string;
}) {
  const encodedServiceKey = isLikelyEncodedKey(serviceKey)
    ? serviceKey
    : encodeURIComponent(serviceKey);

  const params = new URLSearchParams({
    pageNo: "1",
    numOfRows: "100",
    dataType: "JSON",
    regId,
  });

  return `${LAND_BASE_URL}?ServiceKey=${encodedServiceKey}&${params.toString()}`;
}

function buildLandOverviewRequestUrl(serviceKey: string): string {
  const encodedServiceKey = isLikelyEncodedKey(serviceKey)
    ? serviceKey
    : encodeURIComponent(serviceKey.trim());
  const params = new URLSearchParams({
    pageNo: "1",
    numOfRows: "10",
    dataType: "JSON",
    stnId: LAND_OVERVIEW_STN_ID,
  });
  return `${LAND_OVERVIEW_BASE_URL}?ServiceKey=${encodedServiceKey}&${params.toString()}`;
}

async function fetchJsonWithValidation(url: string, cityName: string) {
  let res: Response;

  try {
    res = await fetchWithTimeout(url);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "알 수 없는 네트워크 오류";
    throw new Error(`${cityName} API 연결 실패: ${message}`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `${cityName} API 호출 실패: ${res.status}${body ? ` ${body.slice(0, 120)}` : ""}`,
    );
  }

  const raw = await res.text();
  let json: any;

  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error(
      `${cityName} API 응답 파싱 실패: ${raw.slice(0, 120) || "빈 응답"}`,
    );
  }

  const resultCode = json?.response?.header?.resultCode;
  const resultMsg = json?.response?.header?.resultMsg;

  if (resultCode && resultCode !== "00") {
    throw new Error(
      `${cityName} API 응답 오류: ${resultCode} ${resultMsg ?? ""}`.trim(),
    );
  }

  return json;
}

async function fetchLandForecast(
  serviceKey: string,
  city: City,
): Promise<LandFcstItem[]> {
  const normalizedKey = normalizeServiceKey(serviceKey);

  const url = buildLandRequestUrl({
    serviceKey: normalizedKey,
    regId: city.regId,
  });

  const json = await fetchJsonWithValidation(url, city.name);
  const items = json?.response?.body?.items?.item ?? [];

  if (!Array.isArray(items) || items.length === 0) {
    throw new Error(`${city.name} 통보문 데이터가 비어 있습니다.`);
  }

  return items;
}

function collectSlotTemperatures(slots: Array<LandSlotValue | undefined>) {
  const values = slots
    .map((slot) => slot?.ta)
    .filter(
      (value): value is number =>
        typeof value === "number" && Number.isFinite(value),
    );

  return {
    minTemp: values.length ? Math.min(...values) : null,
    maxTemp: values.length ? Math.max(...values) : null,
  };
}

function createDailyWeatherFromLand(
  morning?: LandSlotValue,
  afternoon?: LandSlotValue,
): DailyWeather {
  const amSky = morning?.label ?? null;
  const pmSky = afternoon?.label ?? null;
  const { minTemp, maxTemp } = collectSlotTemperatures([morning, afternoon]);

  return {
    minTemp,
    maxTemp,
    sky:
      mergeLandMorningAfternoonWeather(
        toWeatherLabelLike(amSky),
        toWeatherLabelLike(pmSky),
      ) ?? pmSky ?? amSky,
    amSky,
    pmSky,
    amPop: morning?.rnSt ?? null,
    pmPop: afternoon?.rnSt ?? null,
  };
}

function isDifferentNumber(
  a: number | null | undefined,
  b: number | null | undefined,
): boolean {
  const aa = a ?? null;
  const bb = b ?? null;
  return aa !== bb;
}

function getDailyFieldChanges(latest: DailyWeather, previous: DailyWeather) {
  return {
    sky: (latest.sky ?? null) !== (previous.sky ?? null),
    minTemp: isDifferentNumber(latest.minTemp, previous.minTemp),
    maxTemp: isDifferentNumber(latest.maxTemp, previous.maxTemp),
    amPop: isDifferentNumber(latest.amPop, previous.amPop),
    pmPop: isDifferentNumber(latest.pmPop, previous.pmPop),
  };
}

function emptyDailyWeather(): DailyWeather {
  return {
    minTemp: null,
    maxTemp: null,
    sky: null,
    amSky: null,
    pmSky: null,
    amPop: null,
    pmPop: null,
  };
}

function summarizeBase(announceTime: string | null) {
  const digits = String(announceTime ?? "").replace(/\D/g, "");

  if (digits.length < 10) {
    return { baseDate: "-", baseTime: "-" };
  }

  return {
    baseDate: digits.slice(0, 8),
    baseTime: digits.slice(8, 12).padEnd(4, "0"),
  };
}

function formatTempValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function buildTomorrowNationalTempRangeText(rows: WeatherCityData[]): string {
  const excludedCities = new Set(["이어도", "울릉도", "독도"]);
  const nationwideRows = rows.filter((row) => !excludedCities.has(row.city));

  const tomorrowMins = nationwideRows
    .map((row) => row.tomorrow.minTemp)
    .filter((value): value is number => value != null && Number.isFinite(value));
  const tomorrowMaxs = nationwideRows
    .map((row) => row.tomorrow.maxTemp)
    .filter((value): value is number => value != null && Number.isFinite(value));

  if (tomorrowMins.length === 0 || tomorrowMaxs.length === 0) return "-";

  const minLow = Math.min(...tomorrowMins);
  const minHigh = Math.max(...tomorrowMins);
  const maxLow = Math.min(...tomorrowMaxs);
  const maxHigh = Math.max(...tomorrowMaxs);

  return `전국 최저기온 ${formatTempValue(minLow)}~${formatTempValue(minHigh)} / 최고기온 ${formatTempValue(maxLow)}~${formatTempValue(maxHigh)}`;
}

function extractOverviewTextFromJson(json: any): string {
  const resultCode = json?.response?.header?.resultCode;
  if (resultCode && resultCode !== "00") return "";
  const items = json?.response?.body?.items?.item;
  const first = Array.isArray(items) ? items[0] : items;
  const wfSv1 = typeof first?.wfSv1 === "string" ? first.wfSv1.trim() : "";
  if (wfSv1) return wfSv1;
  const wfSv = typeof first?.wfSv === "string" ? first.wfSv.trim() : "";
  return wfSv;
}

async function fetchLandOverviewText(serviceKey: string): Promise<string> {
  const normalizedKey = normalizeServiceKey(serviceKey);
  if (!normalizedKey) return "";

  const url = buildLandOverviewRequestUrl(normalizedKey);
  let res: Response;
  try {
    res = await fetchWithTimeout(url);
  } catch {
    return "";
  }

  if (!res.ok) return "";
  const raw = await res.text();
  let json: any;
  try {
    json = JSON.parse(raw);
  } catch {
    return "";
  }

  try {
    return extractOverviewTextFromJson(json);
  } catch {
    return "";
  }
}

async function fetchCityForecast(
  serviceKey: string,
  city: City,
): Promise<CityForecastResult> {
  const items = await fetchLandForecast(serviceKey, city);
  const land = summarizeLandForecast(items);
  const tomorrow = createDailyWeatherFromLand(
    land.tomorrowAm,
    land.tomorrowPm,
  );
  const dayAfterTomorrow = createDailyWeatherFromLand(
    land.day2Am,
    land.day2Pm,
  );
  const threeDaysLater = createDailyWeatherFromLand(
    land.day3Am,
    land.day3Pm,
  );

  const landPublishHighlights = computeLandPublishHighlights(items, city.regId);

  return {
    city: city.name,
    announceTime: land.announceTime,
    landPublishHighlights: landPublishHighlights ?? undefined,
    tomorrow,
    dayAfterTomorrow,
    threeDaysLater,
  };
}

function isFivePmPublish(baseTime: string): boolean {
  return baseTime.replace(/\D/g, "").slice(0, 2) === "17";
}

async function readStoredMapBaseline(
  baseDate: string,
  apiKey: string,
): Promise<StoredMapHighlightBaseline | null> {
  if (typeof window === "undefined") return null;
  try {
    const response = await fetch(`/api/map-baseline?date=${baseDate}`, {
      cache: "no-store",
      headers: { "x-kma-service-key": apiKey },
    });
    if (!response.ok) return readLocalBaseline(baseDate);
    const json = (await response.json()) as {
      ok?: boolean;
      payload?: StoredMapHighlightBaseline | null;
    };
    const parsed = json.payload ?? null;
    if (!parsed) return readLocalBaseline(baseDate);
    if (!parsed || typeof parsed.date !== "string" || !Array.isArray(parsed.rows)) {
      return readLocalBaseline(baseDate);
    }
    return parsed;
  } catch {
    return readLocalBaseline(baseDate);
  }
}

async function writeStoredMapBaseline(
  baseDate: string,
  rows: WeatherCityData[],
  apiKey: string,
) {
  if (typeof window === "undefined") return;
  const payload: StoredMapHighlightBaseline = {
    date: baseDate,
    rows: rows.map((row) => ({
      city: row.city,
      tomorrow: { ...row.tomorrow },
      dayAfterTomorrow: { ...row.dayAfterTomorrow },
      threeDaysLater: { ...row.threeDaysLater },
    })),
  };

  // 서버 KV 여부와 무관하게 같은 브라우저에서는 11시→17시 비교가 가능하도록 보관
  writeLocalBaseline(payload);

  try {
    await fetch("/api/map-baseline", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-kma-service-key": apiKey,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
  } catch {
    // 서버 저장 실패는 하이라이트 동작을 막지 않음
  }
}

export async function persistElevenAmBaselineSnapshot(
  weather: Pick<WeatherResult, "base" | "data">,
  apiKey: string,
): Promise<void> {
  const baseDate = weather.base.baseDate;
  const baseTime = weather.base.baseTime;
  if (!baseDate || baseDate === "-" || !baseTime.startsWith("11")) return;
  await writeStoredMapBaseline(baseDate, weather.data, apiKey);
}

async function applyStoredMapHighlights(
  rows: WeatherCityData[],
  baseDate: string,
  baseTime: string,
  apiKey: string,
): Promise<WeatherCityData[]> {
  const stored = await readStoredMapBaseline(baseDate, apiKey);
  const sameDateBaseline = stored && stored.date === baseDate ? stored : null;
  const previousByCity = sameDateBaseline
    ? new Map(sameDateBaseline.rows.map((row) => [row.city, row]))
    : null;
  const useStoredCompare = isFivePmPublish(baseTime) && previousByCity != null;

  const nextRows = rows.map((row) => {
    const prev = previousByCity?.get(row.city) ?? null;
    const prevTomorrow = prev?.tomorrow ?? emptyDailyWeather();
    const prevDayAfterTomorrow = prev?.dayAfterTomorrow ?? emptyDailyWeather();
    const prevThreeDaysLater = prev?.threeDaysLater ?? emptyDailyWeather();
    const tomorrowChanges =
      useStoredCompare && prev != null
        ? getDailyFieldChanges(row.tomorrow, prevTomorrow)
        : null;
    const day2Changes =
      useStoredCompare && prev != null
        ? getDailyFieldChanges(row.dayAfterTomorrow, prevDayAfterTomorrow)
        : null;
    const day3Changes =
      useStoredCompare && prev != null
        ? getDailyFieldChanges(row.threeDaysLater, prevThreeDaysLater)
        : null;

    const hasAnyStoredHighlight =
      tomorrowChanges?.sky === true ||
      tomorrowChanges?.minTemp === true ||
      tomorrowChanges?.maxTemp === true ||
      tomorrowChanges?.amPop === true ||
      tomorrowChanges?.pmPop === true ||
      day2Changes?.sky === true ||
      day2Changes?.minTemp === true ||
      day2Changes?.maxTemp === true ||
      day3Changes?.sky === true ||
      day3Changes?.minTemp === true ||
      day3Changes?.maxTemp === true;

    if (!hasAnyStoredHighlight) return row;
    return {
      ...row,
      landPublishHighlights: {
        tomorrowSky:
          (row.landPublishHighlights?.tomorrowSky ?? false) ||
          (tomorrowChanges?.sky ?? false),
        tomorrowMinTemp:
          (row.landPublishHighlights?.tomorrowMinTemp ?? false) ||
          (tomorrowChanges?.minTemp ?? false),
        tomorrowMaxTemp:
          (row.landPublishHighlights?.tomorrowMaxTemp ?? false) ||
          (tomorrowChanges?.maxTemp ?? false),
        tomorrowAmPop:
          (row.landPublishHighlights?.tomorrowAmPop ?? false) ||
          (tomorrowChanges?.amPop ?? false),
        tomorrowPmPop:
          (row.landPublishHighlights?.tomorrowPmPop ?? false) ||
          (tomorrowChanges?.pmPop ?? false),
        dayAfterTomorrowSky:
          (row.landPublishHighlights?.dayAfterTomorrowSky ?? false) ||
          (day2Changes?.sky ?? false),
        dayAfterTomorrowMinTemp:
          (row.landPublishHighlights?.dayAfterTomorrowMinTemp ?? false) ||
          (day2Changes?.minTemp ?? false),
        dayAfterTomorrowMaxTemp:
          (row.landPublishHighlights?.dayAfterTomorrowMaxTemp ?? false) ||
          (day2Changes?.maxTemp ?? false),
        threeDaysLaterSky:
          (row.landPublishHighlights?.threeDaysLaterSky ?? false) ||
          (day3Changes?.sky ?? false),
        threeDaysLaterMinTemp:
          (row.landPublishHighlights?.threeDaysLaterMinTemp ?? false) ||
          (day3Changes?.minTemp ?? false),
        threeDaysLaterMaxTemp:
          (row.landPublishHighlights?.threeDaysLaterMaxTemp ?? false) ||
          (day3Changes?.maxTemp ?? false),
      },
    };
  });

  // 11시 발표 데이터만 baseline으로 저장한다.
  // (17시 발표 데이터는 노출/비교에만 사용)
  if (baseTime.startsWith("11")) {
    await writeStoredMapBaseline(baseDate, rows, apiKey);
  }

  return nextRows;
}

async function runInBatches<T, R>(
  items: T[],
  batchSize: number,
  worker: (item: T) => Promise<R>,
) {
  const results: PromiseSettledResult<R>[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const settled = await Promise.allSettled(batch.map((item) => worker(item)));
    results.push(...settled);
  }

  return results;
}

function latestAnnounceTime(data: CityForecastResult[]) {
  return (
    [...data]
      .map((item) => item.announceTime)
      .filter((value): value is string => Boolean(value))
      .sort((a, b) => {
        const aa = Number(a.replace(/\D/g, ""));
        const bb = Number(b.replace(/\D/g, ""));
        return aa - bb;
      })
      .at(-1) ?? null
  );
}

export async function getWeatherData(kmaServiceKey: string): Promise<WeatherResult> {
  const [settled, landOverviewText] = await Promise.all([
    runInBatches(MAP_CITIES, CONCURRENCY, (city) =>
      fetchCityForecast(kmaServiceKey, city),
    ),
    fetchLandOverviewText(kmaServiceKey),
  ]);

  const data = settled.flatMap((item) =>
    item.status === "fulfilled" ? [item.value] : [],
  );

  const warnings = settled.flatMap((item) => {
    if (item.status !== "rejected") return [];
    const message =
      item.reason instanceof Error ? item.reason.message : "알 수 없는 오류";
    const city =
      MAP_CITIES.find((candidate) => message.startsWith(candidate.name))?.name ??
      "일부 지역";
    return [{ city, message }];
  });

  if (data.length === 0) {
    const firstMessage = warnings[0]?.message ?? "날씨 정보를 불러오지 못했습니다.";
    throw new Error(firstMessage);
  }

  const latestBase = latestAnnounceTime(data);
  const weatherData: WeatherCityData[] = data.map(
    ({ announceTime: _announceTime, ...rest }) => rest,
  );
  const base = summarizeBase(latestBase);
  const highlightedData = await applyStoredMapHighlights(
    weatherData,
    base.baseDate,
    base.baseTime,
    kmaServiceKey,
  );

  return {
    base,
    updatedAt: new Date().toISOString(),
    landOverviewText,
    tomorrowNationalTempRangeText: buildTomorrowNationalTempRangeText(weatherData),
    data: highlightedData,
    warnings,
  };
}
