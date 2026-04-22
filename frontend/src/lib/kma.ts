import mapCitiesJson from "../../data/map-cities.json";
import tableCitiesJson from "../../data/table-cities.json";
import mapMarkerPositionsJson from "../../data/map-marker-positions.json";

export type City = {
  name: string;
  lat: number;
  lon: number;
  regId: string;
};

export type LandFcstItem = {
  announceTime?: string | number;
  numEf: string | number;
  regId?: string;
  rnSt?: string | number;
  rnYn?: string | number;
  ta?: string | number;
  wf?: string;
  wfSv?: string;
  wfSv1?: string;
  wfCd?: string;
};

export type LandSlotValue = {
  wf: string | null;
  wfCd: string | null;
  rnYn: number | null;
  rnSt: number | null;
  ta: number | null;
  label: WeatherLabel | null;
};

export type LandSummary = {
  announceTime: string | null;
  tomorrowAm?: LandSlotValue;
  tomorrowPm?: LandSlotValue;
  day2Am?: LandSlotValue;
  day2Pm?: LandSlotValue;
  day3Am?: LandSlotValue;
  day3Pm?: LandSlotValue;
};

export type DailyWeather = {
  minTemp: number | null;
  maxTemp: number | null;
  sky: string | null;
  amSky: string | null;
  pmSky: string | null;
  amPop: number | null;
  pmPop: number | null;
};

/** 직전 발표 대비, UI에 실제 보이는 값 단위 변경 여부 */
export type LandPublishHighlight = {
  /** 지도 카드: 내일 요약 날씨 */
  tomorrowSky: boolean;
  /** 지도 카드/예상날씨: 내일 최저기온 숫자 */
  tomorrowMinTemp: boolean;
  /** 지도 카드/예상날씨: 내일 최고기온 숫자 */
  tomorrowMaxTemp: boolean;
  /** 강수확률(%) 오전 막대 */
  tomorrowAmPop: boolean;
  /** 강수확률(%) 오후 막대 */
  tomorrowPmPop: boolean;
  dayAfterTomorrowSky: boolean;
  dayAfterTomorrowMinTemp: boolean;
  dayAfterTomorrowMaxTemp: boolean;
  threeDaysLaterSky: boolean;
  threeDaysLaterMinTemp: boolean;
  threeDaysLaterMaxTemp: boolean;
};

export type CityWeather = {
  city: string;
  tomorrow: DailyWeather;
  dayAfterTomorrow: DailyWeather;
  threeDaysLater: DailyWeather;
  landPublishHighlights?: LandPublishHighlight;
};

export type MarkerPosition = {
  x: number;
  y: number;
};

export const MAP_CITIES: City[] = mapCitiesJson;
export const TABLE_CITIES: string[] = tableCitiesJson;
export const PRECIP_CITIES: readonly string[] = tableCitiesJson;
export const MAP_MARKER_POSITIONS: Record<string, MarkerPosition> =
  mapMarkerPositionsJson;


export function getTargetDate(offsetDays: number) {
  const now = new Date();
  now.setUTCHours(now.getUTCHours() + 9 + offsetDays * 24);

  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");

  return `${yyyy}${mm}${dd}`;
}

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

function wfCdToWeatherLabel(
  value: string | null | undefined,
): WeatherLabel | null {
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
  if (code === 4) return "비"; // 소나기 -> 비 취급

  return null;
}

function landSlotToWeatherLabel(slot: {
  rnYn?: string | number | null;
  wfCd?: string | null;
}): WeatherLabel | null {
  return rnYnToWeatherLabel(slot.rnYn) ?? wfCdToWeatherLabel(slot.wfCd);
}

function isPrecipGroup(label: WeatherLabel | null): boolean {
  return label === "비" || label === "비나눈" || label === "눈";
}

function isLightSkyGroup(label: WeatherLabel | null): boolean {
  return label === "맑음" || label === "구름조금";
}

function isCloudyGroup(label: WeatherLabel | null): boolean {
  return label === "구름많음" || label === "흐림";
}

function isCloudGroupForAfterRain(label: WeatherLabel | null): boolean {
  return label === "구름조금" || label === "구름많음";
}

export function mergeLandMorningAfternoonWeather(
  morning: WeatherLabel | null,
  afternoon: WeatherLabel | null,
): WeatherLabel | null {
  if (!morning && !afternoon) return null;
  if (morning && !afternoon) return morning;
  if (!morning && afternoon) return afternoon;

  if (morning === afternoon) return morning;

  if (
    (morning === "맑음" && afternoon === "구름조금") ||
    (morning === "구름조금" && afternoon === "맑음")
  ) {
    return "구름조금";
  }

  if (isPrecipGroup(morning) && isPrecipGroup(afternoon)) {
    return "비나눈";
  }

  if (isLightSkyGroup(morning) && isCloudyGroup(afternoon)) {
    return "차차흐림";
  }

  if (isCloudyGroup(morning) && isLightSkyGroup(afternoon)) {
    return "흐린후갬";
  }

  if (
    (isLightSkyGroup(morning) || isCloudyGroup(morning)) &&
    isPrecipGroup(afternoon)
  ) {
    return "흐린후비";
  }

  if (
    isPrecipGroup(morning) &&
    (afternoon === "맑음" || isCloudGroupForAfterRain(afternoon))
  ) {
    return "비후갬";
  }

  if (isCloudyGroup(morning) && isCloudyGroup(afternoon)) {
    return "흐림";
  }

  return afternoon ?? morning;
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
): keyof Omit<LandSummary, "announceTime"> | null {
  const numEf = Number(numEfRaw);
  const hour = getAnnounceHour(announceTime);

  if (!Number.isFinite(numEf) || hour == null) return null;

  // 05시 발표
  // 0=오늘오전, 1=오늘오후, 2=내일오전, 3=내일오후, 4=모레오전, 5=모레오후, 6=글피오전, 7=글피오후
  if (hour >= 5 && hour < 11) {
    if (numEf === 2) return "tomorrowAm";
    if (numEf === 3) return "tomorrowPm";
    if (numEf === 4) return "day2Am";
    if (numEf === 5) return "day2Pm";
    if (numEf === 6) return "day3Am";
    if (numEf === 7) return "day3Pm";
    return null;
  }

  // 11시 발표
  // 0=오늘오후, 1=내일오전, 2=내일오후, 3=모레오전, 4=모레오후, 5=글피오전, 6=글피오후
  if (hour >= 11 && hour < 17) {
    if (numEf === 1) return "tomorrowAm";
    if (numEf === 2) return "tomorrowPm";
    if (numEf === 3) return "day2Am";
    if (numEf === 4) return "day2Pm";
    if (numEf === 5) return "day3Am";
    if (numEf === 6) return "day3Pm";
    return null;
  }

  // 17시 발표
  // 0=오늘밤, 1=내일오전, 2=내일오후, 3=모레오전, 4=모레오후, 5=글피오전, 6=글피오후, 7=그글피오전, 8=그글피오후
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

export function summarizeLandForecast(items: LandFcstItem[]): LandSummary {
  if (!Array.isArray(items) || items.length === 0) {
    return { announceTime: null };
  }

  const latestAnnounceTime =
    [...items]
      .map((item) => item.announceTime)
      .filter(
        (value): value is string | number =>
          value != null && String(value).trim() !== "",
      )
      .sort((a, b) => {
        const aa = Number(String(a).replace(/\D/g, ""));
        const bb = Number(String(b).replace(/\D/g, ""));
        return aa - bb;
      })
      .at(-1) ?? null;

  if (!latestAnnounceTime) {
    return { announceTime: null };
  }

  const latestItems = items.filter(
    (item) => String(item.announceTime ?? "") === String(latestAnnounceTime),
  );

  const summary: LandSummary = {
    announceTime: String(latestAnnounceTime),
  };

  for (const item of latestItems) {
    const slot = resolveLandSlot(latestAnnounceTime, item.numEf);
    if (!slot) continue;

    summary[slot] = {
      wf: item.wf ?? null,
      wfCd: item.wfCd ?? null,
      rnYn:
        item.rnYn == null || item.rnYn === "" ? null : Number(item.rnYn),
      rnSt:
        item.rnSt == null || item.rnSt === "" ? null : Number(item.rnSt),
      ta:
        item.ta == null || item.ta === "" ? null : Number(item.ta),
      label: landSlotToWeatherLabel({
        rnYn: item.rnYn,
        wfCd: item.wfCd ?? null,
      }),
    };
  }

  return summary;
}

function getTwoLatestAnnounceTimesFromItems(
  items: LandFcstItem[],
): { previous: string; latest: string } | null {
  const times = new Set(
    items
      .map((i) => String(i.announceTime ?? "").trim())
      .filter((s) => s.length > 0),
  );
  const sorted = [...times].sort(
    (a, b) =>
      Number(String(a).replace(/\D/g, "")) -
      Number(String(b).replace(/\D/g, "")),
  );
  if (sorted.length < 2) return null;
  const latest = sorted[sorted.length - 1]!;
  const latestHour = getAnnounceHour(latest);
  const latestDate = String(latest).replace(/\D/g, "").slice(0, 8);

  // 오후 5시 발표 하이라이트는 같은 날짜 11시 발표와만 비교한다.
  if (latestHour === 17 && latestDate.length === 8) {
    for (let i = sorted.length - 2; i >= 0; i--) {
      const candidate = sorted[i]!;
      const candDigits = String(candidate).replace(/\D/g, "");
      if (candDigits.slice(0, 8) !== latestDate) continue;
      if (getAnnounceHour(candidate) === 11) {
        return { previous: candidate, latest };
      }
    }
    // 같은 날짜 11시가 없으면 하이라이트를 만들지 않는다.
    return null;
  }

  return {
    previous: sorted[sorted.length - 2]!,
    latest,
  };
}

function collectNumEfsForSlots(
  announceTime: string,
  slots: ReadonlyArray<keyof Omit<LandSummary, "announceTime">>,
): Set<number> {
  const slotSet = new Set(slots);
  const out = new Set<number>();
  for (let numEf = 0; numEf <= 12; numEf++) {
    const slot = resolveLandSlot(announceTime, numEf);
    if (slot && slotSet.has(slot)) out.add(numEf);
  }
  return out;
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

export function dailyFromLandSlots(
  morning?: LandSlotValue,
  afternoon?: LandSlotValue,
): DailyWeather {
  const amSky = morning?.label ?? null;
  const pmSky = afternoon?.label ?? null;
  const { minTemp, maxTemp } = collectSlotTemperatures([morning, afternoon]);

  return {
    minTemp,
    maxTemp,
    sky: mergeLandMorningAfternoonWeather(amSky, pmSky) ?? pmSky ?? amSky,
    amSky,
    pmSky,
    amPop: morning?.rnSt ?? null,
    pmPop: afternoon?.rnSt ?? null,
  };
}

/**
 * 최신·직전 발표시각 각각의 항목을 regId+numEf로 맞춘 뒤 페이로드가 달라졌는지 검사하고,
 * 최신 발표 시각 기준으로 내일/모레/글피 슬롯에 매핑되는 numEf만 UI 플래그로 반환합니다.
 */
export function computeLandPublishHighlights(
  items: LandFcstItem[],
  regId: string,
): LandPublishHighlight | null {
  const pair = getTwoLatestAnnounceTimesFromItems(items);
  if (!pair) return null;
  const latestHour = getAnnounceHour(pair.latest);
  if (latestHour !== 17) return null;

  const prevItems = items.filter((i) => String(i.announceTime ?? "") === String(pair.previous));
  const latestItems = items.filter((i) => String(i.announceTime ?? "") === String(pair.latest));
  const prevSummary = summarizeLandForecast(prevItems);
  const latestSummary = summarizeLandForecast(latestItems);

  const prevTomorrow = dailyFromLandSlots(prevSummary.tomorrowAm, prevSummary.tomorrowPm);
  const latestTomorrow = dailyFromLandSlots(latestSummary.tomorrowAm, latestSummary.tomorrowPm);
  const prevDay2 = dailyFromLandSlots(prevSummary.day2Am, prevSummary.day2Pm);
  const latestDay2 = dailyFromLandSlots(latestSummary.day2Am, latestSummary.day2Pm);
  const prevDay3 = dailyFromLandSlots(prevSummary.day3Am, prevSummary.day3Pm);
  const latestDay3 = dailyFromLandSlots(latestSummary.day3Am, latestSummary.day3Pm);

  return {
    tomorrowSky: (latestTomorrow.sky ?? null) !== (prevTomorrow.sky ?? null),
    tomorrowMinTemp: (latestTomorrow.minTemp ?? null) !== (prevTomorrow.minTemp ?? null),
    tomorrowMaxTemp: (latestTomorrow.maxTemp ?? null) !== (prevTomorrow.maxTemp ?? null),
    tomorrowAmPop: (latestTomorrow.amPop ?? null) !== (prevTomorrow.amPop ?? null),
    tomorrowPmPop: (latestTomorrow.pmPop ?? null) !== (prevTomorrow.pmPop ?? null),
    dayAfterTomorrowSky: (latestDay2.sky ?? null) !== (prevDay2.sky ?? null),
    dayAfterTomorrowMinTemp: (latestDay2.minTemp ?? null) !== (prevDay2.minTemp ?? null),
    dayAfterTomorrowMaxTemp: (latestDay2.maxTemp ?? null) !== (prevDay2.maxTemp ?? null),
    threeDaysLaterSky: (latestDay3.sky ?? null) !== (prevDay3.sky ?? null),
    threeDaysLaterMinTemp: (latestDay3.minTemp ?? null) !== (prevDay3.minTemp ?? null),
    threeDaysLaterMaxTemp: (latestDay3.maxTemp ?? null) !== (prevDay3.maxTemp ?? null),
  };
}

export function getMarkerPosition(city: string) {
  const fallback = { x: 50, y: 50 };
  const position = MAP_MARKER_POSITIONS[city] ?? fallback;

  return {
    left: `${position.x}%`,
    top: `${position.y}%`,
  };
}
