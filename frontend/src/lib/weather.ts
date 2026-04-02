import {
  MAP_CITIES,
  getBaseDateTime,
  getTargetDate,
  latLonToGrid,
  summarizeDailyWeather,
} from "./kma";

function kmaApiOrigin(): string {
  if (import.meta.env.DEV) {
    return `${window.location.origin}/__proxy/kma`;
  }
  return "https://apis.data.go.kr";
}

const BASE_URL = `${kmaApiOrigin()}/1360000/VilageFcstInfoService_2.0/getVilageFcst`;
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

async function fetchCityForecast(
  serviceKey: string,
  cityName: string,
  lat: number,
  lon: number,
) {
  const normalizedKey = normalizeServiceKey(serviceKey);
  const { baseDate, baseTime } = getBaseDateTime();
  const { nx, ny } = latLonToGrid(lat, lon);
  const url = buildRequestUrl({
    serviceKey: normalizedKey,
    baseDate,
    baseTime,
    nx,
    ny,
  });

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

  const items = json?.response?.body?.items?.item ?? [];

  if (!Array.isArray(items) || items.length === 0) {
    throw new Error(`${cityName} 예보 데이터가 비어 있습니다.`);
  }

  const tomorrowDate = getTargetDate(1);
  const dayAfterTomorrowDate = getTargetDate(2);
  const threeDaysLaterDate = getTargetDate(3);

  return {
    city: cityName,
    lat,
    lon,
    tomorrow: summarizeDailyWeather(items, tomorrowDate),
    dayAfterTomorrow: summarizeDailyWeather(items, dayAfterTomorrowDate),
    threeDaysLater: summarizeDailyWeather(items, threeDaysLaterDate),
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
    fetchCityForecast(kmaServiceKey, city.name, city.lat, city.lon),
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
