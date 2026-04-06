import {
  MAP_CITIES,
  getBaseDateTime,
  getTargetDate,
  latLonToGrid,
  summarizeDailyWeather,
  summarizeLandForecast,
  mergeLandMorningAfternoonWeather,
  type City,
  type LandFcstItem,
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

const BASE_URL =
  `${kmaApiOrigin()}/1360000/VilageFcstInfoService_2.0/getVilageFcst`;
const LAND_BASE_URL =
  `${kmaApiOrigin()}/1360000/VilageFcstMsgService/getLandFcst`;
const REQUEST_TIMEOUT_MS = 12000;
const CONCURRENCY = 5;

type WeatherWarning = {
  city: string;
  message: string;
};

type DailyWeatherSummary = ReturnType<typeof summarizeDailyWeather>;

export type WeatherResult = {
  base: { baseDate: string; baseTime: string };
  updatedAt: string;
  data: Array<{
    city: string;
    lat: number;
    lon: number;
    tomorrow: DailyWeatherSummary;
    dayAfterTomorrow: DailyWeatherSummary;
    threeDaysLater: DailyWeatherSummary;
  }>;
  warnings: WeatherWarning[];
};

function isLikelyEncodedKey(value: string) {
  return /%[0-9A-Fa-f]{2}/.test(value);
}

function normalizeServiceKey(rawKey: string) {
  return rawKey.trim();
}

function buildRequestUrl({
  serviceKey,
  baseDate,
  baseTime,
  nx,
  ny,
}: {
  serviceKey: string;
  baseDate: string;
  baseTime: string;
  nx: number;
  ny: number;
}) {
  const encodedServiceKey = isLikelyEncodedKey(serviceKey)
    ? serviceKey
    : encodeURIComponent(serviceKey);

  const params = new URLSearchParams({
    pageNo: "1",
    numOfRows: "2000",
    dataType: "JSON",
    base_date: baseDate,
    base_time: baseTime,
    nx: String(nx),
    ny: String(ny),
  });

  return `${BASE_URL}?serviceKey=${encodedServiceKey}&${params.toString()}`;
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

  return `${LAND_BASE_URL}?serviceKey=${encodedServiceKey}&${params.toString()}`;
}

async function fetchJsonWithValidation(url: string, cityName: string) {
  const res = await fetchWithTimeout(url);

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `${cityName} API 호출 실패: ${res.status}${body ? ` ${body.slice(0, 120)}` : ""}`,
    );
  }

  const json = await res.json();
  const resultCode = json?.response?.header?.resultCode;
  const resultMsg = json?.response?.header?.resultMsg;

  if (resultCode && resultCode !== "00") {
    throw new Error(
      `${cityName} API 응답 오류: ${resultCode} ${resultMsg ?? ""}`.trim(),
    );
  }

  return json;
}

async function fetchVillageForecast(serviceKey: string, city: City) {
  const normalizedKey = normalizeServiceKey(serviceKey);
  const { baseDate, baseTime } = getBaseDateTime();
  const { nx, ny } = latLonToGrid(city.lat, city.lon);

  const url = buildRequestUrl({
    serviceKey: normalizedKey,
    baseDate,
    baseTime,
    nx,
    ny,
  });

  const json = await fetchJsonWithValidation(url, city.name);
  const items = json?.response?.body?.items?.item ?? [];

  if (!Array.isArray(items) || items.length === 0) {
    throw new Error(`${city.name} 예보 데이터가 비어 있습니다.`);
  }

  return items;
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

async function fetchCityForecast(
  serviceKey: string,
  city: City,
): Promise<CityForecastResult> {
  const normalizedKey = normalizeServiceKey(serviceKey);

  const [villageResult, landResult] = await Promise.allSettled([
    fetchVillageForecast(normalizedKey, city),
    fetchLandForecast(normalizedKey, city),
  ]);

  if (villageResult.status !== "fulfilled") {
    throw villageResult.reason;
  }

  const tomorrowDate = getTargetDate(1);
  const dayAfterTomorrowDate = getTargetDate(2);
  const threeDaysLaterDate = getTargetDate(3);

  const villageTomorrow = summarizeDailyWeather(
    villageResult.value,
    tomorrowDate,
  );
  const villageDay2 = summarizeDailyWeather(
    villageResult.value,
    dayAfterTomorrowDate,
  );
  const villageDay3 = summarizeDailyWeather(
    villageResult.value,
    threeDaysLaterDate,
  );

  const land =
    landResult.status === "fulfilled"
      ? summarizeLandForecast(landResult.value)
      : { announceTime: null };

  const tomorrowAmLabel = land.tomorrowAm?.label ?? villageTomorrow.amSky;
  const tomorrowPmLabel = land.tomorrowPm?.label ?? villageTomorrow.pmSky;
  const day2AmLabel = land.day2Am?.label ?? villageDay2.amSky;
  const day2PmLabel = land.day2Pm?.label ?? villageDay2.pmSky;
  const day3AmLabel = land.day3Am?.label ?? villageDay3.amSky;
  const day3PmLabel = land.day3Pm?.label ?? villageDay3.pmSky;

  return {
    city: city.name,
    lat: city.lat,
    lon: city.lon,

    tomorrow: {
      ...villageTomorrow,
      // 오전/오후 날씨: 통보문 rnYn 우선, wfCd 보조
      amSky: tomorrowAmLabel,
      pmSky: tomorrowPmLabel,
      // 오전/오후 강수확률: 통보문 rnSt
      amPop: land.tomorrowAm?.rnSt ?? villageTomorrow.amPop,
      pmPop: land.tomorrowPm?.rnSt ?? villageTomorrow.pmPop,
      // 대표 날씨: 위 오전/오후 라벨을 규칙대로 합성
      sky:
      mergeLandMorningAfternoonWeather(
      toWeatherLabelLike(tomorrowAmLabel),
      toWeatherLabelLike(tomorrowPmLabel),
      ) ?? villageTomorrow.sky,
    },

    dayAfterTomorrow: {
      ...villageDay2,
      amSky: day2AmLabel,
      pmSky: day2PmLabel,
      sky:
        mergeLandMorningAfternoonWeather(
          toWeatherLabelLike(day2AmLabel),
          toWeatherLabelLike(day2PmLabel),
        ) ?? villageDay2.sky,
    },

    threeDaysLater: {
      ...villageDay3,
      amSky: day3AmLabel,
      pmSky: day3PmLabel,
      sky:
        mergeLandMorningAfternoonWeather(
          toWeatherLabelLike(day3AmLabel),
          toWeatherLabelLike(day3PmLabel),
        ) ?? villageDay3.sky,
    },

    warning:
      landResult.status === "rejected"
        ? (landResult.reason instanceof Error
            ? landResult.reason.message
            : "통보문 조회 실패")
        : null,
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

export async function getWeatherData(kmaServiceKey: string): Promise<WeatherResult> {
  const settled = await runInBatches(MAP_CITIES, CONCURRENCY, (city) =>
    fetchCityForecast(kmaServiceKey, city),
  );

  const data = settled.flatMap((r) =>
    r.status === "fulfilled" ? [r.value] : [],
  );

  const warnings = settled.flatMap((item) => {
    if (item.status !== "rejected") return [];
    const message =
      item.reason instanceof Error ? item.reason.message : "알 수 없는 오류";
    const city =
      MAP_CITIES.find((c) => message.startsWith(c.name))?.name ?? "일부 지역";
    return [{ city, message }];
  });

  if (data.length === 0) {
    const firstMessage = warnings[0]?.message ?? "날씨 정보를 불러오지 못했습니다.";
    throw new Error(firstMessage);
  }

  return {
    base: getBaseDateTime(),
    updatedAt: new Date().toISOString(),
    data,
    warnings,
  };
}
