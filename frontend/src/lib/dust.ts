import { getTargetDate } from "./kma";
import dustRegionGroupsJson from "../../data/dust-region-groups.json";

export type DustLevel = "좋음" | "보통" | "나쁨" | "매우 나쁨" | "unknown";

type KnownDustLevel = Exclude<DustLevel, "unknown">;

export type DustRegionItem = {
  displayLabel: string;
  pm10: DustLevel;
  pm25: DustLevel;
  details?: DustRegionDetailItem[];
};

export type DustRegionValueHighlight = {
  pm10: boolean;
  pm25: boolean;
};

export type DustData = {
  dataTime: string | null;
  announcedAt: string | null;
  regions: DustRegionItem[];
  /** 직전 발표 대비 등급 문구가 달라진 열(행×등급종류) */
  valueHighlights?: DustRegionValueHighlight[];
};

export type DustRegionDetailItem = {
  label: string;
  pm10: DustLevel;
  pm25: DustLevel;
};

type DustForecastItem = {
  dataTime?: string;
  informData?: string;
  informCode?: string;
  informGrade?: string;
};

function dustApiOrigin(): string {
  if (import.meta.env.DEV) {
    return `${window.location.origin}/__proxy/air`;
  }
  return "https://api.odcloud.kr";
}

const BASE_URL = `${dustApiOrigin()}/api/MinuDustFrcstDspthSvrc/v1/getMinuDustFrcstDspth`;

type DustRegionGroup = {
  region: string;
  displayLabel: string;
  aliases: readonly string[];
  breakdowns?: readonly {
    label: string;
    aliases: readonly string[];
  }[];
};

const REGION_GROUPS = dustRegionGroupsJson as readonly DustRegionGroup[];

function getTodayKST() {
  const now = new Date();
  const kst = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const yyyy = kst.getFullYear();
  const mm = String(kst.getMonth() + 1).padStart(2, "0");
  const dd = String(kst.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatDashedDate(yyyymmdd: string) {
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

function extractForecastDate(item: DustForecastItem) {
  const raw = item.informData ?? item.dataTime ?? "";
  const match = raw.match(/(\d{4})[-./]?(\d{2})[-./]?(\d{2})/);
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function normalizeServiceKey(rawKey: string) {
  return rawKey.trim();
}

function isLikelyEncodedKey(value: string) {
  return /%[0-9A-Fa-f]{2}/.test(value);
}

function normalizeDustLevel(text: string): KnownDustLevel {
  if (text.includes("매우나쁨") || text.includes("매우 나쁨")) return "매우 나쁨";
  if (text.includes("나쁨")) return "나쁨";
  if (text.includes("보통")) return "보통";
  return "좋음";
}

function rank(level: KnownDustLevel) {
  if (level === "좋음") return 1;
  if (level === "보통") return 2;
  if (level === "나쁨") return 3;
  return 4;
}

function isKnownDustLevel(level: DustLevel): level is KnownDustLevel {
  return level !== "unknown";
}

function worstOf(levels: KnownDustLevel[]): DustLevel {
  if (!levels.length) return "unknown";
  return [...levels].sort((a, b) => rank(b) - rank(a))[0];
}

function parseRegionGrades(informGrade: string) {
  const regionGrades = new Map<string, KnownDustLevel>();
  const normalized = informGrade.replace(/\s+/g, " ").trim();
  const pattern =
    /([^:：]+?)\s*[:：]\s*(좋음|보통|나쁨|매우나쁨|매우 나쁨)(?=(?:,|$))/g;

  for (const match of normalized.matchAll(pattern)) {
    const regionsPart = match[1]?.trim();
    const level = match[2] ? normalizeDustLevel(match[2]) : null;

    if (!regionsPart || !level) continue;

    for (const rawRegion of regionsPart.split(",")) {
      const region = rawRegion.trim();
      if (!region) continue;
      regionGrades.set(region, level);
    }
  }

  return regionGrades;
}

function resolveRegionGrade(
  regionGrades: Map<string, KnownDustLevel>,
  aliases: readonly string[],
): DustLevel {
  for (const alias of aliases) {
    const grade = regionGrades.get(alias);
    if (grade) return grade;
  }

  return "unknown";
}

function createRegionDetails(
  group: DustRegionGroup,
  pm10RegionGrades: Map<string, KnownDustLevel>,
  pm25RegionGrades: Map<string, KnownDustLevel>,
): DustRegionDetailItem[] | undefined {
  if (!group.breakdowns?.length) return undefined;

  return group.breakdowns.map((breakdown) => ({
    label: breakdown.label,
    pm10: resolveRegionGrade(pm10RegionGrades, breakdown.aliases),
    pm25: resolveRegionGrade(pm25RegionGrades, breakdown.aliases),
  }));
}

function summarizeRegionGrade(
  group: DustRegionGroup,
  regionGrades: Map<string, KnownDustLevel>,
  details: DustRegionDetailItem[] | undefined,
  key: "pm10" | "pm25",
): DustLevel {
  const detailGrades =
    details
      ?.map((detail) => detail[key])
      .filter((grade): grade is KnownDustLevel => isKnownDustLevel(grade)) ?? [];

  if (detailGrades.length) {
    return worstOf(detailGrades);
  }

  return resolveRegionGrade(regionGrades, group.aliases);
}

function normalizeAnnouncedAt(value?: string) {
  if (!value) return null;

  const trimmed = value.replace(/\s+/g, " ").trim();
  const match = trimmed.match(
    /(\d{4})[년\-./]\s*(\d{1,2})[월\-./]\s*(\d{1,2})(?:일)?(?:\s+(\d{1,2})(?::|시)\s*(\d{1,2})?)?/,
  );

  if (!match) return trimmed;

  const [, year, month, day, hour, minute] = match;
  const yyyy = year;
  const mm = month.padStart(2, "0");
  const dd = day.padStart(2, "0");

  if (!hour) {
    return `${yyyy}-${mm}-${dd}`;
  }

  const hh = hour.padStart(2, "0");
  const min = (minute ?? "00").padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

function forecastItemSortKey(item: DustForecastItem): number {
  const raw = String(item.dataTime ?? item.informData ?? "");
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 8 ? Number(digits) : 0;
}

function forecastsForDateSortedDesc(
  items: DustForecastItem[],
  targetDate: string,
): DustForecastItem[] {
  return items
    .filter((item) => extractForecastDate(item) === targetDate)
    .sort((a, b) => forecastItemSortKey(b) - forecastItemSortKey(a));
}

function pickTwoLatestDistinctByTime(
  sortedDesc: DustForecastItem[],
): [DustForecastItem, DustForecastItem] | null {
  if (sortedDesc.length < 2) return null;
  const latest = sortedDesc[0]!;
  const latestKey = forecastItemSortKey(latest);
  const previous =
    sortedDesc.find((item) => forecastItemSortKey(item) < latestKey) ?? null;
  if (!previous) return null;
  return [latest, previous];
}

function extractPublishHour(item: DustForecastItem): number | null {
  const digits = String(item.dataTime ?? item.informData ?? "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  return Number(digits.slice(8, 10));
}

async function fetchForecastItems(
  serviceKey: string,
  informCode: "PM10" | "PM25",
): Promise<DustForecastItem[]> {
  const normalizedKey = normalizeServiceKey(serviceKey);

  const params = new URLSearchParams({
    returnType: "json",
    numOfRows: "100",
    pageNo: "1",
    searchDate: getTodayKST(),
    informCode,
  });

  const encodedServiceKey = isLikelyEncodedKey(normalizedKey)
    ? normalizedKey
    : encodeURIComponent(normalizedKey);

  const res = await fetch(
    `${BASE_URL}?serviceKey=${encodedServiceKey}&${params.toString()}`,
    { cache: "no-store" },
  );

  if (!res.ok) {
    throw new Error(`미세먼지 예보 API 호출 실패: ${res.status}`);
  }

  const json = await res.json();
  const items: DustForecastItem[] = json?.response?.body?.items ?? [];

  if (!Array.isArray(items) || items.length === 0) {
    throw new Error(`${informCode} 예보 데이터가 비어 있습니다.`);
  }

  return items;
}

async function fetchForecast(
  serviceKey: string,
  informCode: "PM10" | "PM25",
  targetDate: string,
) {
  const items = await fetchForecastItems(serviceKey, informCode);
  const sorted = forecastsForDateSortedDesc(items, targetDate);
  const matched = sorted[0];

  if (!matched) {
    throw new Error(`${informCode} 예보에서 ${targetDate} 데이터를 찾지 못했습니다.`);
  }

  return { matched, sortedForDate: sorted };
}

function buildRegionValueHighlights(
  pm10Sorted: DustForecastItem[],
  pm25Sorted: DustForecastItem[],
): DustRegionValueHighlight[] | undefined {
  const pm10Pair = pickTwoLatestDistinctByTime(pm10Sorted);
  const pm25Pair = pickTwoLatestDistinctByTime(pm25Sorted);
  if (!pm10Pair || !pm25Pair) return undefined;
  const pm10LatestHour = extractPublishHour(pm10Pair[0]);
  const pm25LatestHour = extractPublishHour(pm25Pair[0]);
  if (pm10LatestHour !== 17 || pm25LatestHour !== 17) return undefined;

  const pm10LatestMap = parseRegionGrades(pm10Pair[0].informGrade ?? "");
  const pm10PrevMap = parseRegionGrades(pm10Pair[1].informGrade ?? "");
  const pm25LatestMap = parseRegionGrades(pm25Pair[0].informGrade ?? "");
  const pm25PrevMap = parseRegionGrades(pm25Pair[1].informGrade ?? "");

  return REGION_GROUPS.map((group) => {
    const latestDetails = createRegionDetails(
      group,
      pm10LatestMap,
      pm25LatestMap,
    );
    const prevDetails = createRegionDetails(group, pm10PrevMap, pm25PrevMap);

    const pm10Latest = summarizeRegionGrade(
      group,
      pm10LatestMap,
      latestDetails,
      "pm10",
    );
    const pm10Prev = summarizeRegionGrade(
      group,
      pm10PrevMap,
      prevDetails,
      "pm10",
    );
    const pm25Latest = summarizeRegionGrade(
      group,
      pm25LatestMap,
      latestDetails,
      "pm25",
    );
    const pm25Prev = summarizeRegionGrade(
      group,
      pm25PrevMap,
      prevDetails,
      "pm25",
    );

    return {
      pm10: pm10Prev !== pm10Latest,
      pm25: pm25Prev !== pm25Latest,
    };
  });
}

export async function getDustData(airkoreaServiceKey: string): Promise<DustData> {
  const targetDate = formatDashedDate(getTargetDate(1));

  const [pm10Result, pm25Result] = await Promise.all([
    fetchForecast(airkoreaServiceKey, "PM10", targetDate),
    fetchForecast(airkoreaServiceKey, "PM25", targetDate),
  ]);

  const pm10Data = pm10Result.matched;
  const pm25Data = pm25Result.matched;

  const pm10GradeText = pm10Data.informGrade ?? "";
  const pm25GradeText = pm25Data.informGrade ?? "";
  const announcedAtRaw = pm10Data.dataTime ?? pm25Data.dataTime ?? null;
  const pm10RegionGrades = parseRegionGrades(pm10GradeText);
  const pm25RegionGrades = parseRegionGrades(pm25GradeText);

  const regions: DustRegionItem[] = REGION_GROUPS.map((group) => {
    const details = createRegionDetails(group, pm10RegionGrades, pm25RegionGrades);

    return {
      displayLabel: group.displayLabel,
      pm10: summarizeRegionGrade(group, pm10RegionGrades, details, "pm10"),
      pm25: summarizeRegionGrade(group, pm25RegionGrades, details, "pm25"),
      details,
    };
  });

  const valueHighlights = buildRegionValueHighlights(
    pm10Result.sortedForDate,
    pm25Result.sortedForDate,
  );

  return {
    dataTime: targetDate,
    announcedAt: normalizeAnnouncedAt(announcedAtRaw ?? undefined),
    regions,
    valueHighlights,
  };
}

export function createEmptyDustData(): DustData {
  return {
    dataTime: null,
    announcedAt: null,
    regions: REGION_GROUPS.map((group) => ({
      displayLabel: group.displayLabel,
      pm10: "unknown",
      pm25: "unknown",
    })),
  };
}
