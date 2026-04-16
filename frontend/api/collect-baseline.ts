import mapCitiesJson from "../data/map-cities.json";
import {
  baselineKvKey,
  isKvConfigured,
  isValidDate,
  kstDateYmd,
  kvGet,
  kvSet,
  userKeysKvKey,
  type BaselineDailyWeather,
  type BaselinePayload,
  type RegisteredUserKey,
} from "./_baseline-common.js";

type City = {
  name: string;
  regId: string;
};

type LandFcstItem = {
  announceTime?: string | number;
  numEf: string | number;
  regId?: string;
  rnSt?: string | number;
  rnYn?: string | number;
  ta?: string | number;
  wfCd?: string;
};

type LandSlotValue = {
  rnYn: number | null;
  rnSt: number | null;
  ta: number | null;
  label: WeatherLabel | null;
};

type DailyTriple = {
  tomorrow: BaselineDailyWeather;
  dayAfterTomorrow: BaselineDailyWeather;
  threeDaysLater: BaselineDailyWeather;
};

type SlotName =
  | "tomorrowAm"
  | "tomorrowPm"
  | "day2Am"
  | "day2Pm"
  | "day3Am"
  | "day3Pm";

type WeatherLabel =
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
  | "비나눈";

const CITIES: City[] = mapCitiesJson as City[];
const REQUEST_TIMEOUT_MS = 12000;
const LAND_BASE_URL =
  "https://apis.data.go.kr/1360000/VilageFcstMsgService/getLandFcst";
const BASELINE_TTL_SECONDS = 60 * 60 * 48;

function isLikelyEncodedKey(value: string) {
  return /%[0-9A-Fa-f]{2}/.test(value);
}

function getAnnounceHour(
  announceTime: string | number | null | undefined,
): number | null {
  if (announceTime == null) return null;
  const digits = String(announceTime).replace(/\D/g, "");
  if (digits.length < 10) return null;
  return Number(digits.slice(8, 10));
}

function resolveLandSlot(
  announceTime: string | number | null | undefined,
  numEfRaw: string | number,
): SlotName | null {
  const numEf = Number(numEfRaw);
  const hour = getAnnounceHour(announceTime);
  if (!Number.isFinite(numEf) || hour == null) return null;

  if (hour >= 5 && hour < 11) {
    if (numEf === 2) return "tomorrowAm";
    if (numEf === 3) return "tomorrowPm";
    if (numEf === 4) return "day2Am";
    if (numEf === 5) return "day2Pm";
    if (numEf === 6) return "day3Am";
    if (numEf === 7) return "day3Pm";
    return null;
  }
  if (hour >= 11 && hour < 17) {
    if (numEf === 1) return "tomorrowAm";
    if (numEf === 2) return "tomorrowPm";
    if (numEf === 3) return "day2Am";
    if (numEf === 4) return "day2Pm";
    if (numEf === 5) return "day3Am";
    if (numEf === 6) return "day3Pm";
    return null;
  }
  if (hour >= 17) {
    if (numEf === 1) return "tomorrowAm";
    if (numEf === 2) return "tomorrowPm";
    if (numEf === 3) return "day2Am";
    if (numEf === 4) return "day2Pm";
    if (numEf === 5) return "day3Am";
    if (numEf === 6) return "day3Pm";
    return null;
  }

  return null;
}

function wfCdToWeatherLabel(value: string | null | undefined): WeatherLabel | null {
  const code = String(value ?? "").trim();
  if (code === "DB01") return "맑음";
  if (code === "DB02") return "구름조금";
  if (code === "DB03") return "구름많음";
  if (code === "DB04") return "흐림";
  return null;
}

function rnYnToWeatherLabel(
  value: string | number | null | undefined,
): WeatherLabel | null {
  const code = Number(value);
  if (!Number.isFinite(code) || code === 0) return null;
  if (code === 1) return "비";
  if (code === 2) return "비나눈";
  if (code === 3) return "눈";
  if (code === 4) return "비";
  return null;
}

function mergeLandMorningAfternoonWeather(
  morning: WeatherLabel | null,
  afternoon: WeatherLabel | null,
): WeatherLabel | null {
  if (!morning && !afternoon) return null;
  if (morning && !afternoon) return morning;
  if (!morning && afternoon) return afternoon;
  if (morning === afternoon) return morning;

  const isPrecip = (v: WeatherLabel | null) => v === "비" || v === "비나눈" || v === "눈";
  const isLight = (v: WeatherLabel | null) => v === "맑음" || v === "구름조금";
  const isCloudy = (v: WeatherLabel | null) => v === "구름많음" || v === "흐림";
  const isCloudAfterRain = (v: WeatherLabel | null) => v === "구름조금" || v === "구름많음";

  if (
    (morning === "맑음" && afternoon === "구름조금") ||
    (morning === "구름조금" && afternoon === "맑음")
  ) {
    return "구름조금";
  }
  if (isPrecip(morning) && isPrecip(afternoon)) return "비나눈";
  if (isLight(morning) && isCloudy(afternoon)) return "차차흐림";
  if (isCloudy(morning) && isLight(afternoon)) return "흐린후갬";
  if ((isLight(morning) || isCloudy(morning)) && isPrecip(afternoon)) return "흐린후비";
  if (isPrecip(morning) && (afternoon === "맑음" || isCloudAfterRain(afternoon))) {
    return "비후갬";
  }
  if (isCloudy(morning) && isCloudy(afternoon)) return "흐림";
  return afternoon ?? morning;
}

function createDaily(morning?: LandSlotValue, afternoon?: LandSlotValue): BaselineDailyWeather {
  const amSky = morning?.label ?? null;
  const pmSky = afternoon?.label ?? null;
  const temperatures = [morning?.ta, afternoon?.ta].filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );
  return {
    minTemp: temperatures.length ? Math.min(...temperatures) : null,
    maxTemp: temperatures.length ? Math.max(...temperatures) : null,
    sky: mergeLandMorningAfternoonWeather(amSky, pmSky) ?? pmSky ?? amSky,
    amSky,
    pmSky,
    amPop: morning?.rnSt ?? null,
    pmPop: afternoon?.rnSt ?? null,
  };
}

function asSlotValue(item: LandFcstItem): LandSlotValue {
  return {
    rnYn: item.rnYn == null || item.rnYn === "" ? null : Number(item.rnYn),
    rnSt: item.rnSt == null || item.rnSt === "" ? null : Number(item.rnSt),
    ta: item.ta == null || item.ta === "" ? null : Number(item.ta),
    label: rnYnToWeatherLabel(item.rnYn) ?? wfCdToWeatherLabel(item.wfCd ?? null),
  };
}

function latestAnnounceTime(items: LandFcstItem[]): string | null {
  const picked =
    [...items]
      .map((item) => item.announceTime)
      .filter(
        (value): value is string | number => value != null && String(value).trim() !== "",
      )
      .sort((a, b) => Number(String(a).replace(/\D/g, "")) - Number(String(b).replace(/\D/g, "")))
      .at(-1) ?? null;
  return picked ? String(picked) : null;
}

function summarizeCity(items: LandFcstItem[]): { announceTime: string; daily: DailyTriple } | null {
  const latest = latestAnnounceTime(items);
  if (!latest) return null;
  const slots: Partial<Record<SlotName, LandSlotValue>> = {};
  for (const item of items) {
    if (String(item.announceTime ?? "") !== latest) continue;
    const slot = resolveLandSlot(latest, item.numEf);
    if (!slot) continue;
    slots[slot] = asSlotValue(item);
  }

  return {
    announceTime: latest,
    daily: {
      tomorrow: createDaily(slots.tomorrowAm, slots.tomorrowPm),
      dayAfterTomorrow: createDaily(slots.day2Am, slots.day2Pm),
      threeDaysLater: createDaily(slots.day3Am, slots.day3Pm),
    },
  };
}

async function fetchWithTimeout(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timeout);
  }
}

function buildLandRequestUrl(serviceKey: string, regId: string): string {
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

async function fetchCityLandItems(serviceKey: string, city: City): Promise<LandFcstItem[]> {
  const response = await fetchWithTimeout(buildLandRequestUrl(serviceKey, city.regId));
  if (!response.ok) {
    throw new Error(`${city.name} API status ${response.status}`);
  }
  const raw = await response.text();
  const json = JSON.parse(raw);
  const resultCode = json?.response?.header?.resultCode;
  if (resultCode && resultCode !== "00") {
    throw new Error(`${city.name} API error ${resultCode}`);
  }
  const items = json?.response?.body?.items?.item ?? [];
  if (!Array.isArray(items)) {
    throw new Error(`${city.name} items invalid`);
  }
  return items;
}

async function collectBaselineRowsForKey(serviceKey: string): Promise<{
  baseDate: string;
  baseHour: number;
  rows: BaselinePayload["rows"];
} | null> {
  const settled = await Promise.allSettled(
    CITIES.map(async (city) => {
      const items = await fetchCityLandItems(serviceKey, city);
      const summary = summarizeCity(items);
      if (!summary) return null;
      return {
        city: city.name,
        announceTime: summary.announceTime,
        ...summary.daily,
      };
    }),
  );

  const rows = settled.flatMap((item) => (item.status === "fulfilled" && item.value ? [item.value] : []));
  if (rows.length === 0) return null;

  const latestTime =
    [...rows]
      .map((row) => row.announceTime)
      .sort((a, b) => Number(a.replace(/\D/g, "")) - Number(b.replace(/\D/g, "")))
      .at(-1) ?? "";

  const digits = latestTime.replace(/\D/g, "");
  const baseDate = digits.slice(0, 8);
  const baseHour = Number(digits.slice(8, 10));
  if (!isValidDate(baseDate) || !Number.isFinite(baseHour)) return null;

  const payloadRows = rows.map((row) => ({
    city: row.city,
    tomorrow: row.tomorrow,
    dayAfterTomorrow: row.dayAfterTomorrow,
    threeDaysLater: row.threeDaysLater,
  }));

  return { baseDate, baseHour, rows: payloadRows };
}

function isAuthorizedCron(req: any): boolean {
  const env = (globalThis as any)?.process?.env;
  const cronSecret = String(env?.CRON_SECRET ?? "").trim();
  if (!cronSecret) return false;
  const auth = String(req.headers?.authorization ?? "").trim();
  const xSecret = String(req.headers?.["x-cron-secret"] ?? "").trim();
  return auth === `Bearer ${cronSecret}` || xSecret === cronSecret;
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "GET" && req.method !== "POST") {
      res.setHeader("Allow", "GET,POST");
      res.status(405).json({ error: "Method not allowed." });
      return;
    }
    if (!isAuthorizedCron(req)) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
    if (!isKvConfigured()) {
      res.status(503).json({
        ok: false,
        error:
          "KV is not configured. Set KV_REST_API_URL + KV_REST_API_TOKEN or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN.",
      });
      return;
    }

    const registered = await kvGet<RegisteredUserKey[]>(userKeysKvKey());
    const users = Array.isArray(registered) ? registered : [];
    if (users.length === 0) {
      res.status(200).json({ ok: true, message: "No registered keys.", processed: 0 });
      return;
    }

    const collectedAt = new Date().toISOString();
    const results: Array<{ keyHash: string; stored: boolean; reason?: string }> = [];

    for (const user of users) {
      const serviceKey = String(user.serviceKey ?? "").trim();
      if (!serviceKey) {
        results.push({ keyHash: user.keyHash, stored: false, reason: "empty-service-key" });
        continue;
      }
      try {
        const collected = await collectBaselineRowsForKey(serviceKey);
        if (!collected) {
          results.push({ keyHash: user.keyHash, stored: false, reason: "collect-failed" });
          continue;
        }
        if (collected.baseHour !== 11) {
          results.push({
            keyHash: user.keyHash,
            stored: false,
            reason: `latest-hour-${collected.baseHour}`,
          });
          continue;
        }

        await kvSet(
          baselineKvKey(collected.baseDate, user.keyHash),
          { date: collected.baseDate, rows: collected.rows } satisfies BaselinePayload,
          BASELINE_TTL_SECONDS,
        );
        results.push({ keyHash: user.keyHash, stored: true });
      } catch (error) {
        const reason = error instanceof Error ? error.message : "unknown-error";
        results.push({ keyHash: user.keyHash, stored: false, reason });
      }
    }

    const storedCount = results.filter((item) => item.stored).length;
    res.status(200).json({
      ok: true,
      collectedAt,
      targetDate: kstDateYmd(),
      processed: users.length,
      storedCount,
      results,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected server error";
    res.status(500).json({ error: message });
  }
}
