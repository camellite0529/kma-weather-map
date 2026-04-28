import astroQueryJson from "../../data/astro-query.json";
import * as SunCalc from "suncalc";

export type AstroTimes = {
  sunrise: string | null;
  sunset: string | null;
  moonrise: string | null;
  moonset: string | null;
};

export type AstroFieldHighlights = {
  sunrise: boolean;
  sunset: boolean;
  moonrise: boolean;
  moonset: boolean;
};

export type AstroResult = AstroTimes & {
  fieldHighlights: AstroFieldHighlights;
};

const NO_ASTRO_HIGHLIGHTS: AstroFieldHighlights = {
  sunrise: false,
  sunset: false,
  moonrise: false,
  moonset: false,
};

const SEOUL_COORDS = {
  latitude: 37.5665,
  longitude: 126.978,
};
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8000;

function kasiApiOrigin(): string {
  if (import.meta.env.DEV) {
    return `${window.location.origin}/__proxy/kma`;
  }
  return "https://apis.data.go.kr";
}

function formatHHMM(value?: string | null) {
  if (!value) return null;
  const digits = String(value).replace(/\D/g, "");
  if (digits.length < 4) return value;
  return `${digits.slice(0, 2)}:${digits.slice(2, 4)}`;
}

type KstDateParts = {
  year: number;
  month: number;
  day: number;
};

function getTomorrowDateKSTParts(): KstDateParts {
  const kst = new Date(Date.now() + KST_OFFSET_MS);
  kst.setUTCDate(kst.getUTCDate() + 1);

  return {
    year: kst.getUTCFullYear(),
    month: kst.getUTCMonth() + 1,
    day: kst.getUTCDate(),
  };
}

function formatKstDateParts({ year, month, day }: KstDateParts) {
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}${mm}${dd}`;
}

function kstDayUtcRange({ year, month, day }: KstDateParts) {
  const start = Date.UTC(year, month - 1, day) - KST_OFFSET_MS;
  return {
    start,
    end: start + DAY_MS,
  };
}

function isValidDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function isWithinRange(date: Date, start: number, end: number) {
  const time = date.getTime();
  return time >= start && time < end;
}

function formatKstTime(date: Date | null | undefined) {
  if (!isValidDate(date)) return null;
  const kst = new Date(date.getTime() + KST_OFFSET_MS);
  const hh = String(kst.getUTCHours()).padStart(2, "0");
  const mm = String(kst.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function getMoonEventForKstDay(
  target: KstDateParts,
  eventName: "rise" | "set",
) {
  const { start, end } = kstDayUtcRange(target);
  const startDate = new Date(start);
  const firstUtcMidnight = Date.UTC(
    startDate.getUTCFullYear(),
    startDate.getUTCMonth(),
    startDate.getUTCDate(),
  );
  const candidates: Date[] = [];

  for (let dayStart = firstUtcMidnight; dayStart <= end; dayStart += DAY_MS) {
    const moonTimes = SunCalc.getMoonTimes(
      new Date(dayStart),
      SEOUL_COORDS.latitude,
      SEOUL_COORDS.longitude,
      true,
    );
    const event = moonTimes[eventName];
    if (isValidDate(event) && isWithinRange(event, start, end)) {
      candidates.push(event);
    }
  }

  candidates.sort((a, b) => a.getTime() - b.getTime());
  return candidates[0] ?? null;
}

function calculateAstroTimes(): AstroResult {
  const target = getTomorrowDateKSTParts();
  const sunTimes = SunCalc.getTimes(
    new Date(Date.UTC(target.year, target.month - 1, target.day)),
    SEOUL_COORDS.latitude,
    SEOUL_COORDS.longitude,
  );

  return {
    sunrise: formatKstTime(sunTimes.sunrise),
    sunset: formatKstTime(sunTimes.sunset),
    moonrise: formatKstTime(getMoonEventForKstDay(target, "rise")),
    moonset: formatKstTime(getMoonEventForKstDay(target, "set")),
    fieldHighlights: NO_ASTRO_HIGHLIGHTS,
  };
}

function hasAnyAstroTime(astro: AstroTimes) {
  return Boolean(astro.sunrise || astro.sunset || astro.moonrise || astro.moonset);
}

async function fetchWithTimeout(url: string) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
    });
  } finally {
    window.clearTimeout(timeout);
  }
}

async function fetchKasiAstroTimes(kasiServiceKey: string): Promise<AstroResult> {
  const serviceKey = kasiServiceKey.trim();

  const encodedServiceKey = /%[0-9A-Fa-f]{2}/.test(serviceKey)
    ? serviceKey
    : encodeURIComponent(serviceKey);

  const params = new URLSearchParams({
    locdate: formatKstDateParts(getTomorrowDateKSTParts()),
    location: astroQueryJson.location,
  });

  const url = `${kasiApiOrigin()}/B090041/openapi/service/RiseSetInfoService/getAreaRiseSetInfo?serviceKey=${encodedServiceKey}&${params.toString()}`;

  const res = await fetchWithTimeout(url);

  if (!res.ok) {
    throw new Error(`출몰시각 API 호출 실패: ${res.status}`);
  }

  const xml = await res.text();

  const pick = (tag: string) => {
    const match = xml.match(new RegExp(`<${tag}>(.*?)</${tag}>`));
    return match?.[1]?.trim() ?? null;
  };

  const astro = {
    sunrise: formatHHMM(pick("sunrise")),
    sunset: formatHHMM(pick("sunset")),
    moonrise: formatHHMM(pick("moonrise")),
    moonset: formatHHMM(pick("moonset")),
    fieldHighlights: NO_ASTRO_HIGHLIGHTS,
  };

  if (!hasAnyAstroTime(astro)) {
    throw new Error("출몰시각 API 응답에 시간 데이터가 없습니다.");
  }

  return astro;
}

export async function getAstroTimes(kasiServiceKey: string): Promise<AstroResult> {
  try {
    return await fetchKasiAstroTimes(kasiServiceKey);
  } catch (error) {
    console.warn("Falling back to calculated astro times.", error);
    return calculateAstroTimes();
  }
}
