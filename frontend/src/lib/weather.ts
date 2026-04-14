import {
  MAP_CITIES,
  getTargetDate,
  summarizeLandForecast,
  getTwoLatestAnnounceTimesFromItems,
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
const REQUEST_TIMEOUT_MS = 12000;
const CONCURRENCY = 5;

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
  data: WeatherCityData[];
  warnings: WeatherWarning[];
};

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
  targetDate: string,
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

/** map 카드에 실제 표기되는 요약 필드 기준 비교 */
function hasMapPortrayedSummaryChanged(
  latest: DailyWeather,
  previous: DailyWeather,
): boolean {
  return (
    (latest.sky ?? null) !== (previous.sky ?? null) ||
    (latest.amSky ?? null) !== (previous.amSky ?? null) ||
    (latest.pmSky ?? null) !== (previous.pmSky ?? null) ||
    isDifferentNumber(latest.minTemp, previous.minTemp) ||
    isDifferentNumber(latest.maxTemp, previous.maxTemp)
  );
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

async function fetchCityForecast(
  serviceKey: string,
  city: City,
): Promise<CityForecastResult> {
  const items = await fetchLandForecast(serviceKey, city);
  const land = summarizeLandForecast(items);
  const tomorrow = createDailyWeatherFromLand(
    getTargetDate(1),
    land.tomorrowAm,
    land.tomorrowPm,
  );
  const dayAfterTomorrow = createDailyWeatherFromLand(
    getTargetDate(2),
    land.day2Am,
    land.day2Pm,
  );
  const threeDaysLater = createDailyWeatherFromLand(
    getTargetDate(3),
    land.day3Am,
    land.day3Pm,
  );

  const landPublishHighlights = computeLandPublishHighlights(items, city.regId);
  if (landPublishHighlights) {
    const pair = getTwoLatestAnnounceTimesFromItems(items);
    if (pair) {
      const previousItems = items.filter(
        (item) => String(item.announceTime ?? "") === String(pair.previous),
      );
      const previousLand = summarizeLandForecast(previousItems);
      const previousTomorrow = createDailyWeatherFromLand(
        getTargetDate(1),
        previousLand.tomorrowAm,
        previousLand.tomorrowPm,
      );
      landPublishHighlights.tomorrowVisual = hasMapPortrayedSummaryChanged(
        tomorrow,
        previousTomorrow,
      );
    } else {
      landPublishHighlights.tomorrowVisual = false;
    }
  }

  return {
    city: city.name,
    announceTime: land.announceTime,
    landPublishHighlights: landPublishHighlights ?? undefined,
    tomorrow,
    dayAfterTomorrow,
    threeDaysLater,
  };
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
  const settled = await runInBatches(MAP_CITIES, CONCURRENCY, (city) =>
    fetchCityForecast(kmaServiceKey, city),
  );

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

  return {
    base: summarizeBase(latestBase),
    updatedAt: new Date().toISOString(),
    data: weatherData,
    warnings,
  };
}
