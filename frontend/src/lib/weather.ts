import {
  MAP_CITIES,
  summarizeLandForecast,
  dailyFromLandSlots,
  computeLandPublishHighlights,
  type City,
  type CityWeather,
  type DailyWeather,
  type LandFcstItem,
} from "./kma";
import { isLikelyEncodedKey, normalizeServiceKey } from "./api-utils";

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
const FCST_ZONE_BASE_URL =
  `${kmaApiOrigin()}/1360000/FcstZoneInfoService/getFcstZoneCd`;
const REQUEST_TIMEOUT_MS = 12000;
const CONCURRENCY = 5;
const NATIONAL_TEMP_RANGE_CONCURRENCY = 10;
const FCST_ZONE_PAGE_SIZE = 1000;
const LAND_OVERVIEW_STN_ID = "108";
const NATIONAL_TEMP_RANGE_REG_ID_START = "11B10101";
const NATIONAL_TEMP_RANGE_REG_ID_END = "11G01001";
const NATIONAL_TEMP_RANGE_EXCLUDED_CITY_NAMES = new Set([
  "이어도",
  "울릉도",
  "독도",
  "제주",
  "서귀포",
]);
const NATIONAL_TEMP_RANGE_FORCE_INCLUDED_REG_IDS = new Set(["11D10501"]); // 영월
const NATIONAL_TEMP_RANGE_FORCE_EXCLUDED_REG_IDS = new Set(["11D20201"]); // 대관령

type WeatherWarning = {
  city: string;
  message: string;
};

type CityForecastResult = CityWeather & {
  announceTime: string | null;
};

export type WeatherResult = {
  base: { baseDate: string; baseTime: string };
  updatedAt: string;
  landOverviewText: string;
  tomorrowNationalTempRangeText: string;
  data: CityWeather[];
  warnings: WeatherWarning[];
};

type ForecastZone = {
  regId: string;
  regName: string;
  regSp: string | null;
};

type NationalTempRangeRow = {
  city: string;
  regId: string;
  tomorrow: DailyWeather;
};

const NATIONAL_TEMP_RANGE_REQUIRED_ZONE_LINES = `
서울 11B10101
인천 11B20201
수원 11B20601
성남 11B20605
안양 11B20602
광명 11B10103
과천 11B10102
평택 11B20606
오산 11B20603
의왕 11B20609
용인 11B20612
군포 11B20610
안성 11B20611
화성 11B20604
양평 11B20503
구리 11B20501
남양주 11B20502
하남 11B20504
이천 11B20701
여주 11B20703
광주 11B20702
의정부 11B20301
고양 11B20302
파주 11B20305
양주 11B20304
동두천 11B20401
연천 11B20402
포천 11B20403
가평 11B20404
강화 11B20101
김포 11B20102
시흥 11B20202
부천 11B20204
안산 11B20203
백령도 11A00101
부산 11H20201
울산 11H20101
김해 11H20304
양산 11H20102
창원 11H20301
밀양 11H20601
함안 11H20603
창녕 11H20604
의령 11H20602
진주 11H20701
하동 11H20704
사천 11H20402
거창 11H20502
합천 11H20503
산청 11H20703
함양 11H20501
통영 11H20401
거제 11H20403
고성 11H20404
남해 11H20405
대구 11H10701
영천 11H10702
경산 11H10703
청도 11H10704
칠곡 11H10705
김천 11H10601
구미 11H10602
군위 11H10707
고령 11H10604
성주 11H10605
안동 11H10501
의성 11H10502
청송 11H10503
상주 11H10302
문경 11H10301
예천 11H10303
영주 11H10401
봉화 11H10402
영양 11H10403
울진 11H10101
영덕 11H10102
포항 11H10201
경주 11H10202
광주 11F20501
나주 11F20503
장성 11F20502
담양 11F20504
화순 11F20505
영광 21F20102
함평 21F20101
목포 21F20801
무안 21F20804
영암 21F20802
진도 21F20201
신안 21F20803
흑산도 11F20701
순천 11F20603
순천시 11F20405
광양 11F20402
구례 11F20601
곡성 11F20602
완도 11F20301
강진 11F20303
장흥 11F20304
해남 11F20302
여수 11F20401
고흥 11F20403
보성 11F20404
전주 11F10201
익산 11F10202
군산 21F10501
정읍 11F10203
김제 21F10502
남원 11F10401
고창 21F10601
무주 11F10302
부안 21F10602
순창 11F10403
완주 11F10204
임실 11F10402
장수 11F10301
진안 11F10303
대전 11C20401
세종 11C20404
공주 11C20402
논산 11C20602
계룡 11C20403
금산 11C20601
천안 11C20301
아산 11C20302
예산 11C20303
서산 11C20101
태안 11C20102
당진 11C20103
홍성 11C20104
보령 11C20201
서천 11C20202
청양 11C20502
부여 11C20501
청주 11C10301
증평 11C10304
괴산 11C10303
진천 11C10102
충주 11C10101
음성 11C10103
제천 11C10201
단양 11C10202
보은 11C10302
옥천 11C10403
영동 11C10402
추풍령 11C10401
철원 11D10101
화천 11D10102
인제 11D10201
양구 11D10202
춘천 11D10301
홍천 11D10302
원주 11D10401
횡성 11D10402
영월 11D10501
정선 11D10502
평창 11D10503
대관령 11D20201
속초 11D20401
고성 11D20402
양양 11D20403
강릉 11D20501
동해 11D20601
삼척 11D20602
태백 11D20301
`;

function parseRequiredNationalTempRangeZones(lines: string): ForecastZone[] {
  const unique = new Map<string, ForecastZone>();
  for (const rawLine of lines.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = line.match(/^(.+?)\s+([0-9]{2}[A-Z][0-9]{5})$/);
    if (!match) continue;
    const regName = match[1].trim();
    const regId = match[2].trim();
    if (isNationalTempRangeExcluded(regName, regId)) continue;
    unique.set(regId, {
      regId,
      regName,
      regSp: "C",
    });
  }
  return [...unique.values()];
}

const NATIONAL_TEMP_RANGE_REQUIRED_ZONES: ForecastZone[] =
  parseRequiredNationalTempRangeZones(NATIONAL_TEMP_RANGE_REQUIRED_ZONE_LINES);

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
const MAP_CITY_REG_ID_BY_NAME = new Map(
  MAP_CITIES.map((city) => [city.name, city.regId]),
);

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

function buildFcstZoneRequestUrl(serviceKey: string, pageNo: number): string {
  const encodedServiceKey = isLikelyEncodedKey(serviceKey)
    ? serviceKey
    : encodeURIComponent(serviceKey.trim());
  const params = new URLSearchParams({
    pageNo: String(pageNo),
    numOfRows: String(FCST_ZONE_PAGE_SIZE),
    dataType: "JSON",
  });
  return `${FCST_ZONE_BASE_URL}?ServiceKey=${encodedServiceKey}&${params.toString()}`;
}

function isNationalTempRangeExcluded(cityName: string, regId: string): boolean {
  if (NATIONAL_TEMP_RANGE_EXCLUDED_CITY_NAMES.has(cityName)) return true;
  if (NATIONAL_TEMP_RANGE_FORCE_EXCLUDED_REG_IDS.has(regId)) return true;
  return false;
}

function isRegIdInNationalRange(regId: string): boolean {
  return (
    regId >= NATIONAL_TEMP_RANGE_REG_ID_START &&
    regId <= NATIONAL_TEMP_RANGE_REG_ID_END
  );
}

function isCityRegSp(regSp: string | null): boolean {
  const value = String(regSp ?? "").trim().toUpperCase();
  return value.startsWith("C");
}

function parseForecastZonesFromJson(json: any): {
  totalCount: number;
  zones: ForecastZone[];
} {
  const resultCode = json?.response?.header?.resultCode;
  const resultMsg = json?.response?.header?.resultMsg;
  if (resultCode && resultCode !== "00") {
    throw new Error(`예보구역 API 응답 오류: ${resultCode} ${resultMsg ?? ""}`.trim());
  }

  const totalCount = Number(json?.response?.body?.totalCount ?? 0);
  const rawItems = json?.response?.body?.items?.item;
  const list = Array.isArray(rawItems)
    ? rawItems
    : rawItems
      ? [rawItems]
      : [];

  const zones = list.flatMap((item: any) => {
    const regId = String(item?.regId ?? "").trim();
    const regName = String(item?.regName ?? "").trim();
    const regSpRaw = String(item?.regSp ?? "").trim();
    if (!regId || !regName) return [];
    return [
      {
        regId,
        regName,
        regSp: regSpRaw || null,
      },
    ];
  });

  return {
    totalCount: Number.isFinite(totalCount) && totalCount > 0 ? totalCount : zones.length,
    zones,
  };
}

async function fetchForecastZones(serviceKey: string): Promise<ForecastZone[]> {
  const normalizedKey = normalizeServiceKey(serviceKey);
  if (!normalizedKey) return [];

  const firstUrl = buildFcstZoneRequestUrl(normalizedKey, 1);
  const firstRes = await fetchWithTimeout(firstUrl);
  if (!firstRes.ok) return [];
  const firstRaw = await firstRes.text();

  let firstJson: any;
  try {
    firstJson = JSON.parse(firstRaw);
  } catch {
    return [];
  }

  let firstPage: { totalCount: number; zones: ForecastZone[] };
  try {
    firstPage = parseForecastZonesFromJson(firstJson);
  } catch {
    return [];
  }

  const totalPages = Math.max(
    1,
    Math.ceil(firstPage.totalCount / FCST_ZONE_PAGE_SIZE),
  );
  const collected = [...firstPage.zones];

  for (let pageNo = 2; pageNo <= totalPages; pageNo += 1) {
    let res: Response;
    try {
      res = await fetchWithTimeout(buildFcstZoneRequestUrl(normalizedKey, pageNo));
    } catch {
      continue;
    }
    if (!res.ok) continue;

    const raw = await res.text();
    let json: any;
    try {
      json = JSON.parse(raw);
    } catch {
      continue;
    }

    try {
      const parsed = parseForecastZonesFromJson(json);
      collected.push(...parsed.zones);
    } catch {
      // 일부 페이지 실패는 건너뜀
    }
  }

  const unique = new Map<string, ForecastZone>();
  for (const zone of collected) {
    if (!unique.has(zone.regId)) {
      unique.set(zone.regId, zone);
    }
  }
  return [...unique.values()];
}

function pickNationalTempRangeZones(zones: ForecastZone[]): ForecastZone[] {
  const inCodeRange = zones.filter(
    (zone) =>
      isRegIdInNationalRange(zone.regId) &&
      !isNationalTempRangeExcluded(zone.regName, zone.regId),
  );
  const forcedIncluded = inCodeRange.filter((zone) =>
    NATIONAL_TEMP_RANGE_FORCE_INCLUDED_REG_IDS.has(zone.regId),
  );
  const cityOnly = inCodeRange.filter((zone) => isCityRegSp(zone.regSp));
  if (cityOnly.length === 0) return inCodeRange;

  const merged = new Map<string, ForecastZone>();
  for (const zone of [...cityOnly, ...forcedIncluded]) {
    merged.set(zone.regId, zone);
  }
  return [...merged.values()];
}

function mergeNationalTempRangeRows(
  ...groups: NationalTempRangeRow[][]
): NationalTempRangeRow[] {
  const unique = new Map<string, NationalTempRangeRow>();
  for (const group of groups) {
    for (const row of group) {
      if (!unique.has(row.regId)) {
        unique.set(row.regId, row);
      }
    }
  }
  return [...unique.values()];
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

type TomorrowTempRange = {
  minLow: number;
  minHigh: number;
  maxLow: number;
  maxHigh: number;
};

function parseTempRangePair(
  text: string,
  patterns: RegExp[],
): [number, number] | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const a = Number(match[1]);
    const b = Number(match[2]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    return [Math.min(a, b), Math.max(a, b)];
  }
  return null;
}

function parseTomorrowNationalTempRangeFromOverview(
  overviewText: string,
): TomorrowTempRange | null {
  const normalized = overviewText.replace(/\s+/g, " ").trim();
  if (!normalized) return null;

  const minPair = parseTempRangePair(normalized, [
    /내일[^.。]{0,220}?(?:아침\s*)?(?:최저\s*)?기온(?:은|이)?\s*(-?\d+(?:\.\d+)?)\s*[~∼\-–—]\s*(-?\d+(?:\.\d+)?)\s*(?:도|℃|°C|C)?/,
    /아침\s*(?:최저\s*)?기온(?:은|이)?\s*(-?\d+(?:\.\d+)?)\s*[~∼\-–—]\s*(-?\d+(?:\.\d+)?)\s*(?:도|℃|°C|C)?/,
  ]);
  const maxPair = parseTempRangePair(normalized, [
    /내일[^.。]{0,240}?(?:낮|한낮)\s*(?:최고\s*)?기온(?:은|이)?\s*(-?\d+(?:\.\d+)?)\s*[~∼\-–—]\s*(-?\d+(?:\.\d+)?)\s*(?:도|℃|°C|C)?/,
    /내일[^.。]{0,240}?최고\s*기온(?:은|이)?\s*(-?\d+(?:\.\d+)?)\s*[~∼\-–—]\s*(-?\d+(?:\.\d+)?)\s*(?:도|℃|°C|C)?/,
    /내일[^.。]{0,240}?(?:낮|한낮)\s*기온(?:은|이)?\s*(-?\d+(?:\.\d+)?)\s*[~∼\-–—]\s*(-?\d+(?:\.\d+)?)\s*(?:도|℃|°C|C)?/,
    /(?:낮|한낮)\s*(?:최고\s*)?기온(?:은|이)?\s*(-?\d+(?:\.\d+)?)\s*[~∼\-–—]\s*(-?\d+(?:\.\d+)?)\s*(?:도|℃|°C|C)?/,
  ]);

  if (!minPair || !maxPair) return null;

  return {
    minLow: minPair[0],
    minHigh: minPair[1],
    maxLow: maxPair[0],
    maxHigh: maxPair[1],
  };
}

function toDefaultNationalTempRangeRows(rows: CityWeather[]): NationalTempRangeRow[] {
  const unique = new Map<string, NationalTempRangeRow>();
  for (const row of rows) {
    const regId = MAP_CITY_REG_ID_BY_NAME.get(row.city);
    if (!regId) continue;
    if (isNationalTempRangeExcluded(row.city, regId)) continue;
    unique.set(regId, {
      city: row.city,
      regId,
      tomorrow: row.tomorrow,
    });
  }
  return [...unique.values()];
}

async function fetchNationalTempRangeSupplementRows(
  serviceKey: string,
  zones: ForecastZone[],
  existingRegIds: Set<string>,
): Promise<NationalTempRangeRow[]> {
  const missingZones = zones.filter((zone) => !existingRegIds.has(zone.regId));
  if (missingZones.length === 0) return [];

  const settled = await runInBatches(
    missingZones,
    NATIONAL_TEMP_RANGE_CONCURRENCY,
    async (zone) => {
      const pseudoCity: City = {
        name: zone.regName,
        regId: zone.regId,
        lat: 0,
        lon: 0,
      };
      let items: LandFcstItem[] | null = null;
      let lastError: unknown = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          items = await fetchLandForecast(serviceKey, pseudoCity);
          break;
        } catch (error) {
          lastError = error;
        }
      }
      if (!items) {
        throw (lastError instanceof Error
          ? lastError
          : new Error(`${zone.regName} 통보문 데이터 조회 실패`));
      }
      const land = summarizeLandForecast(items);
      return {
        city: zone.regName,
        regId: zone.regId,
        tomorrow: dailyFromLandSlots(land.tomorrowAm, land.tomorrowPm),
      } satisfies NationalTempRangeRow;
    },
  );

  return settled.flatMap((item) =>
    item.status === "fulfilled" ? [item.value] : [],
  );
}

async function collectNationalTempRangeRows(
  serviceKey: string,
  rows: CityWeather[],
): Promise<NationalTempRangeRow[]> {
  const defaultRows = toDefaultNationalTempRangeRows(rows);
  const requiredZones = NATIONAL_TEMP_RANGE_REQUIRED_ZONES;

  const defaultRegIds = new Set(defaultRows.map((row) => row.regId));
  const requiredRows = await fetchNationalTempRangeSupplementRows(
    serviceKey,
    requiredZones,
    defaultRegIds,
  );
  const fallbackRows = mergeNationalTempRangeRows(defaultRows, requiredRows);

  try {
    const zones = pickNationalTempRangeZones(await fetchForecastZones(serviceKey));
    if (zones.length === 0) return fallbackRows;

    const targetZoneByRegId = new Map(zones.map((zone) => [zone.regId, zone]));
    for (const zone of requiredZones) {
      targetZoneByRegId.set(zone.regId, zone);
    }
    const targetZones = [...targetZoneByRegId.values()];

    const zoneRegIdSet = new Set(targetZones.map((zone) => zone.regId));
    const fromMapRows = fallbackRows.filter((row) =>
      zoneRegIdSet.has(row.regId),
    );
    const existingRegIds = new Set(fromMapRows.map((row) => row.regId));
    const supplementRows = await fetchNationalTempRangeSupplementRows(
      serviceKey,
      targetZones,
      existingRegIds,
    );
    return mergeNationalTempRangeRows(fromMapRows, supplementRows);
  } catch {
    return fallbackRows;
  }
}

function buildTomorrowNationalTempRangeText(
  rows: CityWeather[],
  nationalRangeRows: NationalTempRangeRow[],
  landOverviewText: string,
): string {
  const sourceRows =
    nationalRangeRows.length > 0
      ? nationalRangeRows
      : toDefaultNationalTempRangeRows(rows);

  const tomorrowMins = sourceRows
    .map((row) => row.tomorrow.minTemp)
    .filter((value): value is number => value != null && Number.isFinite(value));
  const tomorrowMaxs = sourceRows
    .map((row) => row.tomorrow.maxTemp)
    .filter((value): value is number => value != null && Number.isFinite(value));

  if (tomorrowMins.length === 0 || tomorrowMaxs.length === 0) {
    const overviewRange = parseTomorrowNationalTempRangeFromOverview(landOverviewText);
    if (overviewRange) {
      return `최저기온 ${formatTempValue(overviewRange.minLow)}~${formatTempValue(overviewRange.minHigh)}℃\n최고기온 ${formatTempValue(overviewRange.maxLow)}~${formatTempValue(overviewRange.maxHigh)}℃`;
    }
    return "-";
  }

  const minLow = Math.min(...tomorrowMins);
  const minHigh = Math.max(...tomorrowMins);
  const maxLow = Math.min(...tomorrowMaxs);
  const maxHigh = Math.max(...tomorrowMaxs);

  return `최저기온 ${formatTempValue(minLow)}~${formatTempValue(minHigh)}℃\n최고기온 ${formatTempValue(maxLow)}~${formatTempValue(maxHigh)}℃`;
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
  const tomorrow = dailyFromLandSlots(
    land.tomorrowAm,
    land.tomorrowPm,
  );
  const dayAfterTomorrow = dailyFromLandSlots(
    land.day2Am,
    land.day2Pm,
  );
  const threeDaysLater = dailyFromLandSlots(
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
  rows: CityWeather[],
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
  rows: CityWeather[],
  baseDate: string,
  baseTime: string,
  apiKey: string,
): Promise<CityWeather[]> {
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
  const weatherData: CityWeather[] = data.map(
    ({ announceTime: _announceTime, ...rest }) => rest,
  );
  const base = summarizeBase(latestBase);
  const [highlightedData, nationalRangeRows] = await Promise.all([
    applyStoredMapHighlights(
      weatherData,
      base.baseDate,
      base.baseTime,
      kmaServiceKey,
    ),
    collectNationalTempRangeRows(kmaServiceKey, weatherData),
  ]);

  return {
    base,
    updatedAt: new Date().toISOString(),
    landOverviewText,
    tomorrowNationalTempRangeText: buildTomorrowNationalTempRangeText(
      weatherData,
      nationalRangeRows,
      landOverviewText,
    ),
    data: highlightedData,
    warnings,
  };
}
