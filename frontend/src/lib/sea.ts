import { isLikelyEncodedKey, normalizeServiceKey } from "./api-utils";

const REQUEST_TIMEOUT_MS = 12000;

function kmaApiOrigin(): string {
  if (import.meta.env.DEV) {
    return `${window.location.origin}/__proxy/kma`;
  }
  return "https://apis.data.go.kr";
}

const SEA_BASE_URL = `${kmaApiOrigin()}/1360000/VilageFcstMsgService/getSeaFcst`;

type SeaFcstItem = {
  tmFc?: string | number;
  numEf: string | number;
  wh1?: string | number;
  wh2?: string | number;
};

/** UI·복사에 쓰이는 행 한 줄 */
export type SeaForecastRegion = {
  label: string;
  waveRangeText: string | null;
};

export type SeaForecastData = {
  regions: SeaForecastRegion[];
  summaryText: string;
};

/**
 * 단기예보구역 코드표 기반 세부 해역 regId
 *
 * 해역 그룹 배치는 아래 `SEA_REGION_GROUPS`의 `subregions`만 고치면 된다.
 */
const SEA_SUBREGION_CODES = {
  // 서해
  westNorthFront: "12A10100", // 서해북부앞바다
  westNorthFar: "12A10200", // 서해북부먼바다

  westMiddleFront: "12A20100", // 서해중부앞바다
  westMiddleInner: "12A20210", // 서해중부안쪽먼바다
  westMiddleOuter: "12A20220", // 서해중부바깥먼바다

  westSouthFront: "12A30100", // 서해남부앞바다
  westSouthNorthInner: "12A30211", // 서해남부북쪽안쪽먼바다
  westSouthSouthInner: "12A30212", // 서해남부남쪽안쪽먼바다
  westSouthNorthOuter: "12A30221", // 서해남부북쪽바깥먼바다
  westSouthSouthOuter: "12A30222", // 서해남부남쪽바깥먼바다

  // 남해
  southWestFront: "12B10100", // 남해서부앞바다
  southWestWestFar: "12B10201", // 남해서부서쪽먼바다
  southWestEastFar: "12B10202", // 남해서부동쪽먼바다

  southEastFront: "12B20100", // 남해동부앞바다
  southEastInner: "12B20210", // 남해동부안쪽먼바다
  southEastOuter: "12B20220", // 남해동부바깥먼바다

  // 동해
  eastSouthFront: "12C10100", // 동해남부앞바다
  eastSouthSouthInner: "12C10211", // 동해남부남쪽안쪽먼바다
  eastSouthNorthInner: "12C10212", // 동해남부북쪽안쪽먼바다
  eastSouthSouthOuter: "12C10221", // 동해남부남쪽바깥먼바다
  eastSouthNorthOuter: "12C10222", // 동해남부북쪽바깥먼바다

  eastMiddleFront: "12C20100", // 동해중부앞바다
  eastMiddleInner: "12C20210", // 동해중부안쪽먼바다
  eastMiddleOuter: "12C20220", // 동해중부바깥먼바다

  eastNorthFront: "12C30100", // 동해북부앞바다
  eastNorthFar: "12C30200", // 동해북부먼바다
} as const;

type SeaSubregionKey = keyof typeof SEA_SUBREGION_CODES;

/**
 * 표시 순서 = 배열 순서. 그룹에 넣을 세부 해역은 `SEA_SUBREGION_CODES` 키로만 지정한다.
 */
const SEA_REGION_GROUPS: readonly {
  label: string;
  subregions: readonly SeaSubregionKey[];
}[] = [
  {
    label: "서해 앞바다",
    subregions: ["westSouthFront", "westMiddleFront", "westNorthFront"],
  },
  {
    label: "서해 안쪽먼바다",
    subregions: [
      "westMiddleInner",
      "westSouthNorthInner",
      "westSouthSouthInner",
      "westNorthFar",
    ],
  },
  {
    label: "서해 바깥먼바다",
    subregions: ["westMiddleOuter", "westSouthNorthOuter", "westSouthSouthOuter"],
  },
  {
    label: "남해 앞바다",
    subregions: ["southWestFront", "southEastFront"],
  },
  {
    label: "남해 안쪽먼바다",
    subregions: ["southWestEastFar", "southEastInner"],
  },
  {
    label: "남해 바깥먼바다",
    subregions: ["southWestWestFar", "southEastOuter"],
  },
  {
    label: "동해 앞바다",
    subregions: ["eastSouthFront", "eastMiddleFront", "eastNorthFront"],
  },
  {
    label: "동해 안쪽먼바다",
    subregions: ["eastSouthSouthInner", "eastSouthNorthInner", "eastMiddleInner"],
  },
  {
    label: "동해 바깥먼바다",
    subregions: [
      "eastSouthSouthOuter",
      "eastSouthNorthOuter",
      "eastMiddleOuter",
      "eastNorthFar",
    ],
  },
];

/** 요약 문장(최대 파고 해역) 계산용 — UI에는 노출하지 않음 */
type SeaRegionComputed = {
  label: string;
  waveRangeText: string | null;
  minWave: number | null;
  maxWave: number | null;
};

function toFiniteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatWaveNumber(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return rounded.toFixed(1);
}

function formatWaveRange(min: number, max: number): string {
  return `${formatWaveNumber(min)}~${formatWaveNumber(max)}`;
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

function buildSeaRequestUrl({
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

  return `${SEA_BASE_URL}?ServiceKey=${encodedServiceKey}&${params.toString()}`;
}

async function fetchJsonWithValidation(url: string, regionLabel: string) {
  let res: Response;

  try {
    res = await fetchWithTimeout(url);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "알 수 없는 네트워크 오류";
    throw new Error(`${regionLabel} API 연결 실패: ${message}`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `${regionLabel} API 호출 실패: ${res.status}${body ? ` ${body.slice(0, 120)}` : ""}`,
    );
  }

  const raw = await res.text();
  let json: any;

  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error(
      `${regionLabel} API 응답 파싱 실패: ${raw.slice(0, 120) || "빈 응답"}`,
    );
  }

  const resultCode = json?.response?.header?.resultCode;
  const resultMsg = json?.response?.header?.resultMsg;

  if (resultCode && resultCode !== "00") {
    throw new Error(
      `${regionLabel} API 응답 오류: ${resultCode} ${resultMsg ?? ""}`.trim(),
    );
  }

  return json;
}

async function fetchSeaForecastByRegId(
  serviceKey: string,
  regId: string,
  regionLabel: string,
): Promise<SeaFcstItem[]> {
  const normalizedKey = normalizeServiceKey(serviceKey);

  const url = buildSeaRequestUrl({
    serviceKey: normalizedKey,
    regId,
  });

  const json = await fetchJsonWithValidation(url, `${regionLabel}(${regId})`);
  const items = json?.response?.body?.items?.item ?? [];

  if (!Array.isArray(items) || items.length === 0) {
    throw new Error(`${regionLabel}(${regId}) 파고 데이터가 비어 있습니다.`);
  }

  return items;
}

function getAnnounceHour(tmFc: string | number | null | undefined): number | null {
  if (tmFc == null) return null;
  const digits = String(tmFc).replace(/\D/g, "");
  if (digits.length < 10) return null;
  return Number(digits.slice(8, 10));
}

/**
 * `numEf` 의미는 발표시각(tmFc의 시) 구간마다 다름. (기상청 단기예보 통보문 코드표)
 *
 * 17시~익일 5시 미만: 0 오늘오후, 1 내일오전, 2 내일오후, 3~8 모레·글피…
 * 5시~11시 미만: 0 오늘오전, 1 오늘오후, 2 내일오전, 3 내일오후, 4~7 모레·글피…
 * 11시~17시 미만: 0 오늘오후, 1 내일오전, 2 내일오후, 3~6 모레·글피…
 *
 * 내일 파고 범위는 위 규칙으로 "내일 오전"·"내일 오후"에 해당하는 항목만 사용한다.
 */
function resolveTomorrowSlot(
  tmFc: string | number | null | undefined,
  numEfRaw: string | number,
): "tomorrowAm" | "tomorrowPm" | null {
  const hour = getAnnounceHour(tmFc);
  const numEf = Number(numEfRaw);

  if (hour == null || !Number.isFinite(numEf)) return null;

  // 17시 ~ 익일 5시 미만
  if (hour >= 17 || hour < 5) {
    if (numEf === 1) return "tomorrowAm";
    if (numEf === 2) return "tomorrowPm";
    return null;
  }

  // 5시 ~ 11시 미만
  if (hour < 11) {
    if (numEf === 2) return "tomorrowAm";
    if (numEf === 3) return "tomorrowPm";
    return null;
  }

  // 11시 ~ 17시 미만
  if (hour < 17) {
    if (numEf === 1) return "tomorrowAm";
    if (numEf === 2) return "tomorrowPm";
    return null;
  }

  return null;
}

function latestTmFc(items: SeaFcstItem[]): string | null {
  return (
    [...items]
      .map((item) => item.tmFc)
      .filter((value): value is string | number => value != null)
      .sort((a, b) => Number(String(a).replace(/\D/g, "")) - Number(String(b).replace(/\D/g, "")))
      .at(-1)
      ?.toString() ?? null
  );
}

function pickWaveValues(item: SeaFcstItem | null): number[] {
  if (!item) return [];
  return [toFiniteNumber(item.wh1), toFiniteNumber(item.wh2)].filter(
    (value): value is number => value != null,
  );
}

function summarizeWaveItems(items: SeaFcstItem[]) {
  const latest = latestTmFc(items);

  if (!latest) {
    return {
      waveRangeText: null as string | null,
      minWave: null as number | null,
      maxWave: null as number | null,
    };
  }

  const latestItems = items.filter((item) => String(item.tmFc ?? "") === latest);

  let tomorrowAm: SeaFcstItem | null = null;
  let tomorrowPm: SeaFcstItem | null = null;

  for (const item of latestItems) {
    const slot = resolveTomorrowSlot(latest, item.numEf);
    if (slot === "tomorrowAm") tomorrowAm = item;
    if (slot === "tomorrowPm") tomorrowPm = item;
  }

  const waveValues = [...pickWaveValues(tomorrowAm), ...pickWaveValues(tomorrowPm)];

  const finalValues =
    waveValues.length > 0
      ? waveValues
      : latestItems.slice(0, 2).flatMap((item) => pickWaveValues(item));

  if (finalValues.length === 0) {
    return {
      waveRangeText: null as string | null,
      minWave: null as number | null,
      maxWave: null as number | null,
    };
  }

  const minWave = Math.min(...finalValues);
  const maxWave = Math.max(...finalValues);

  return {
    waveRangeText: formatWaveRange(minWave, maxWave),
    minWave,
    maxWave,
  };
}

async function summarizeRegion(
  serviceKey: string,
  group: (typeof SEA_REGION_GROUPS)[number],
): Promise<SeaRegionComputed> {
  const regIds = group.subregions.map((k) => SEA_SUBREGION_CODES[k]);

  const settled = await Promise.allSettled(
    regIds.map((regId) => fetchSeaForecastByRegId(serviceKey, regId, group.label)),
  );

  const parts = settled
    .filter(
      (result): result is PromiseFulfilledResult<SeaFcstItem[]> =>
        result.status === "fulfilled",
    )
    .map((result) => summarizeWaveItems(result.value))
    .filter(
      (
        part,
      ): part is {
        waveRangeText: string;
        minWave: number;
        maxWave: number;
      } => part.minWave != null && part.maxWave != null && part.waveRangeText != null,
    );

  if (parts.length === 0) {
    return {
      label: group.label,
      waveRangeText: null,
      minWave: null,
      maxWave: null,
    };
  }

  const minWave = Math.min(...parts.map((part) => part.minWave));
  const maxWave = Math.max(...parts.map((part) => part.maxWave));

  return {
    label: group.label,
    waveRangeText: formatWaveRange(minWave, maxWave),
    minWave,
    maxWave,
  };
}

function seaAreaFromLabel(label: string): "west" | "south" | "east" | "unknown" {
  if (label.startsWith("서해")) return "west";
  if (label.startsWith("남해")) return "south";
  if (label.startsWith("동해")) return "east";
  return "unknown";
}

function quoteLabels(labels: string[]): string {
  return labels.join(", ");
}

function compactSameAreaLabels(labels: string[]): string {
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0];

  const [first, ...rest] = labels;
  const area = first.split(" ")[0];

  if (!area || !rest.every((label) => label.startsWith(`${area} `))) {
    return quoteLabels(labels);
  }

  const compacted = [first, ...rest.map((label) => label.slice(area.length + 1))].join(", ");
  return compacted;
}

function buildSummaryText(regions: SeaRegionComputed[]): string {
  const validRegions = regions.filter(
    (region): region is SeaRegionComputed & { minWave: number; maxWave: number; waveRangeText: string } =>
      region.minWave != null && region.maxWave != null && region.waveRangeText != null,
  );

  if (validRegions.length === 0) {
    return "바다의 물결 정보가 없습니다.";
  }

  const highestMax = Math.max(...validRegions.map((region) => region.maxWave));
  const maxTiedRegions = validRegions.filter((region) => region.maxWave === highestMax);

  const highestMin = Math.max(...maxTiedRegions.map((region) => region.minWave));
  const strongest = maxTiedRegions.filter((region) => region.minWave === highestMin);

  if (strongest.length === 1) {
    const [picked] = strongest;
    return `바다의 물결은 ${picked.label}에서 ${picked.waveRangeText}m로 일겠다.`;
  }

  const sameArea =
    strongest.length > 0 &&
    strongest.every((region) => seaAreaFromLabel(region.label) === seaAreaFromLabel(strongest[0].label));

  if (sameArea) {
    const sorted = [...strongest].sort((a, b) => a.label.localeCompare(b.label, "ko"));
    const pickedLabels = sorted.slice(0, 2).map((region) => region.label);
    return `바다의 물결은 ${compactSameAreaLabels(pickedLabels)}에서 ${sorted[0].waveRangeText}m로 일겠다.`;
  }

  const uniqueByArea = new Map<string, SeaRegionComputed & { minWave: number; maxWave: number; waveRangeText: string }>();
  for (const region of strongest) {
    const area = seaAreaFromLabel(region.label);
    if (!uniqueByArea.has(area)) {
      uniqueByArea.set(area, region);
    }
  }
  const pickedByArea = [...uniqueByArea.values()]
    .sort((a, b) => a.label.localeCompare(b.label, "ko"))
    .slice(0, 2);

  return `바다의 물결은 ${quoteLabels(pickedByArea.map((region) => region.label))}에서 ${pickedByArea[0].waveRangeText}m로 일겠다.`;
}

function toPublicSeaData(computed: SeaRegionComputed[]): SeaForecastData {
  return {
    regions: computed.map((r) => ({
      label: r.label,
      waveRangeText: r.waveRangeText,
    })),
    summaryText: buildSummaryText(computed),
  };
}

export function createEmptySeaForecastData(): SeaForecastData {
  const computed: SeaRegionComputed[] = SEA_REGION_GROUPS.map((group) => ({
    label: group.label,
    waveRangeText: null,
    minWave: null,
    maxWave: null,
  }));
  return toPublicSeaData(computed);
}

export async function getSeaForecastData(serviceKey: string): Promise<SeaForecastData> {
  const settled = await Promise.allSettled(
    SEA_REGION_GROUPS.map((group) => summarizeRegion(serviceKey, group)),
  );

  const computed: SeaRegionComputed[] = settled.map((result, index) => {
    const group = SEA_REGION_GROUPS[index];

    if (result.status === "fulfilled") return result.value;

    return {
      label: group.label,
      waveRangeText: null,
      minWave: null,
      maxWave: null,
    };
  });

  return toPublicSeaData(computed);
}
