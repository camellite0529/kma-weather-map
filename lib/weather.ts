import {
  ForecastItem,
  MAP_CITIES,
  getBaseDateTime,
  getTargetDate,
  latLonToGrid,
  summarizeDailyWeather
} from "@/lib/kma";

const BASE_URL = "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst";
const REQUEST_TIMEOUT_MS = 12000;
const MAX_RETRIES = 2;
const CONCURRENCY = 5;

type WeatherWarning = {
  city: string;
  message: string;
};

type WeatherResult = {
  base: { baseDate: string; baseTime: string };
  updatedAt: string;
  data: Array<{
    city: string;
    lat: number;
    lon: number;
    tomorrow: ReturnType<typeof summarizeDailyWeather>;
    dayAfterTomorrow: ReturnType<typeof summarizeDailyWeather>;
    threeDaysLater: ReturnType<typeof summarizeDailyWeather>;
  }>;
  warnings: WeatherWarning[];
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
  ny
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
    ny: String(ny)
  });

  return `${BASE_URL}?serviceKey=${encodedServiceKey}&${params.toString()}`;
}

async function fetchWithTimeout(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, {
      signal: controller.signal,
      cache: "no-store"
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchCityForecast(cityName: string, lat: number, lon: number) {
  const rawServiceKey = process.env.KMA_SERVICE_KEY;

  if (!rawServiceKey) {
    throw new Error("KMA_SERVICE_KEY 환경변수가 없습니다.");
  }

  const serviceKey = normalizeServiceKey(rawServiceKey);
  const { baseDate, baseTime } = getBaseDateTime();
  const { nx, ny } = latLonToGrid(lat, lon);
  const url = buildRequestUrl({ serviceKey, baseDate, baseTime, nx, ny });

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const res = await fetchWithTimeout(url);

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`${cityName} API 호출 실패: ${res.status}${body ? ` ${body.slice(0, 120)}` : ""}`);
      }

      const json = await res.json();
      const resultCode = json?.response?.header?.resultCode;
      const resultMsg = json?.response?.header?.resultMsg;

      if (resultCode && resultCode !== "00") {
        throw new Error(`${cityName} API 응답 오류: ${resultCode} ${resultMsg ?? ""}`.trim());
      }

      const items: ForecastItem[] = json?.response?.body?.items?.item ?? [];

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
        threeDaysLater: summarizeDailyWeather(items, threeDaysLaterDate)
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("알 수 없는 오류");

      const isAbort = lastError.name === "AbortError";
      const isRetryable =
        isAbort ||
        /\b(401|403|408|429|500|502|503|504)\b/.test(lastError.message) ||
        /fetch failed/i.test(lastError.message);

      if (!isRetryable || attempt === MAX_RETRIES) {
        break;
      }

      await sleep(400 * (attempt + 1));
    }
  }

  throw lastError ?? new Error(`${cityName} API 호출 실패`);
}

async function runInBatches<T, R>(items: T[], batchSize: number, worker: (item: T) => Promise<R>) {
  const results: PromiseSettledResult<R>[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const settled = await Promise.allSettled(batch.map((item) => worker(item)));
    results.push(...settled);
  }

  return results;
}

export async function getWeatherData(): Promise<WeatherResult> {
  const settled = await runInBatches(MAP_CITIES, CONCURRENCY, (city) =>
    fetchCityForecast(city.name, city.lat, city.lon)
  );

  const data = settled
    .filter((item): item is PromiseFulfilledResult<Awaited<ReturnType<typeof fetchCityForecast>>> => item.status === "fulfilled")
    .map((item) => item.value);

  const warnings = settled
    .filter((item): item is PromiseRejectedResult => item.status === "rejected")
    .map((item) => {
      const message = item.reason instanceof Error ? item.reason.message : "알 수 없는 오류";
      const city = MAP_CITIES.find((candidate) => message.startsWith(candidate.name))?.name ?? "일부 지역";
      return { city, message };
    });

  if (data.length === 0) {
    const firstMessage = warnings[0]?.message ?? "날씨 정보를 불러오지 못했습니다.";
    throw new Error(firstMessage);
  }

  return {
    base: getBaseDateTime(),
    updatedAt: new Date().toISOString(),
    data,
    warnings
  };
}
