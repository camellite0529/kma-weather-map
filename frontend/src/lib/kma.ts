import mapCitiesJson from "../../data/map-cities.json";
import tableCitiesJson from "../../data/table-cities.json";
import mapMarkerPositionsJson from "../../data/map-marker-positions.json";
import precipCitiesJson from "../../data/precip-cities.json";

export type City = {
  name: string;
  lat: number;
  lon: number;
};

export type ForecastItem = {
  category: string;
  fcstDate: string;
  fcstTime: string;
  fcstValue: string;
};

export type DailyWeather = {
  date: string;
  minTemp: number | null;
  maxTemp: number | null;
  sky: string | null;
  amSky: string | null;
  pmSky: string | null;
  amPop: number | null;
  pmPop: number | null;
};

export type CityWeather = {
  city: string;
  lat: number;
  lon: number;
  tomorrow: DailyWeather;
  dayAfterTomorrow: DailyWeather;
  threeDaysLater: DailyWeather;
};

export type MarkerPosition = {
  x: number;
  y: number;
};

export const MAP_CITIES: City[] = mapCitiesJson;
export const TABLE_CITIES: string[] = tableCitiesJson;
export const PRECIP_CITIES: readonly string[] = precipCitiesJson;
export const MAP_MARKER_POSITIONS: Record<string, MarkerPosition> =
  mapMarkerPositionsJson;

function getKstParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const pick = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "00";

  return {
    year: pick("year"),
    month: pick("month"),
    day: pick("day"),
    hour: pick("hour"),
    minute: pick("minute"),
  };
}

export function getBaseDateTime() {
  const now = new Date(Date.now() - 30 * 60 * 1000);
  const { year, month, day, hour, minute } = getKstParts(now);
  const hhmm = Number(`${hour}${minute}`);
  const baseTimes = [2300, 2000, 1700, 1400, 1100, 800, 500, 200];
  const selected = baseTimes.find((t) => hhmm >= t);

  if (selected) {
    return {
      baseDate: `${year}${month}${day}`,
      baseTime: String(selected).padStart(4, "0"),
    };
  }

  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const y = getKstParts(yesterday);
  return {
    baseDate: `${y.year}${y.month}${y.day}`,
    baseTime: "2300",
  };
}

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

export function skyCodeToText(
  value: string | number | null | undefined,
): WeatherLabel | null {
  const code = String(value ?? "");

  if (code === "1") return "맑음";
  if (code === "2") return "구름조금";
  if (code === "3") return "구름많음";
  if (code === "4") return "흐림";

  return null;
}

export function ptyCodeToText(
  value: string | number | null | undefined,
): WeatherLabel | null {
  const code = String(value ?? "0");

  if (code === "1" || code === "5" || code === "4") return "비";
  if (code === "2" || code === "6") return "비나눈";
  if (code === "3" || code === "7") return "눈";

  return null;
}

function pickClosestByTime<T extends ForecastItem>(items: T[], targetTime: number) {
  return [...items].sort((a, b) => {
    const diffA = Math.abs(Number(a.fcstTime) - targetTime);
    const diffB = Math.abs(Number(b.fcstTime) - targetTime);
    return diffA - diffB;
  })[0];
}

function isClearGroup(label: WeatherLabel | null): boolean {
  return label === "맑음" || label === "구름조금";
}

function isCloudGroup(label: WeatherLabel | null): boolean {
  return label === "구름많음" || label === "흐림";
}

function isSkyGroup(label: WeatherLabel | null): boolean {
  return (
    label === "맑음" ||
    label === "구름조금" ||
    label === "구름많음" ||
    label === "흐림"
  );
}

function pickHalfDayWeather(
  dayItems: ForecastItem[],
  startTime: number,
  endTime: number,
  targetTime: number,
): WeatherLabel | null {
  const halfItems = dayItems.filter((item) => {
    const time = Number(item.fcstTime);
    return Number.isFinite(time) && time >= startTime && time < endTime;
  });

  const ptyItems = halfItems.filter(
    (item) => item.category === "PTY" && String(item.fcstValue) !== "0",
  );

  if (ptyItems.length) {
    const pickedPty = pickClosestByTime(ptyItems, targetTime);
    return ptyCodeToText(pickedPty?.fcstValue);
  }

  const skyItems = halfItems.filter((item) => item.category === "SKY");
  if (skyItems.length) {
    const pickedSky = pickClosestByTime(skyItems, targetTime);
    return skyCodeToText(pickedSky?.fcstValue);
  }

  return null;
}

function mergeMorningAfternoonWeather(
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

  if (isCloudGroup(morning) && isCloudGroup(afternoon)) {
    return "흐림";
  }

  if (morning === "비" && afternoon === "비나눈") {
    return "비나눈";
  }

  if ((morning === "비나눈" || morning === "눈") && afternoon === "비") {
    return "비나눈";
  }

  if ((morning === "비나눈" || morning === "비") && afternoon === "눈") {
    return "비나눈";
  }

  if (isClearGroup(morning) && isCloudGroup(afternoon)) {
    return "차차흐림";
  }

  if (isCloudGroup(morning) && isClearGroup(afternoon)) {
    return "흐린후갬";
  }

  if (isSkyGroup(morning) && (afternoon === "비" || afternoon === "비나눈")) {
    return "흐린후비";
  }

  if (isSkyGroup(morning) && afternoon === "눈") {
    return "눈";
  }

  if ((morning === "비" || morning === "비나눈") && isSkyGroup(afternoon)) {
    return "비후갬";
  }

  if (morning === "눈" && isSkyGroup(afternoon)) {
    return "눈";
  }

  if (afternoon === "눈") return "눈";
  if (afternoon === "비나눈") return "비나눈";
  if (afternoon === "비") return "비";
  if (isCloudGroup(afternoon)) return "흐림";
  if (afternoon === "구름조금") return "구름조금";
  if (afternoon === "구름많음") return "구름많음";
  if (afternoon === "맑음") return "맑음";

  return morning;
}

function getPrecipCategoryItems(dayItems: ForecastItem[]) {
  return dayItems.filter((item) => item.category === "POP");
}

export function summarizeDailyWeather(
  items: ForecastItem[],
  targetDate: string,
): DailyWeather {
  const dayItems = items.filter((item) => item.fcstDate === targetDate);

  const tmn = dayItems.find((item) => item.category === "TMN")?.fcstValue;
  const tmx = dayItems.find((item) => item.category === "TMX")?.fcstValue;

  const tmpValues = dayItems
    .filter((item) => item.category === "TMP")
    .map((item) => Number(item.fcstValue))
    .filter((n) => Number.isFinite(n));

  const minTemp =
    tmn != null ? Number(tmn) : tmpValues.length ? Math.min(...tmpValues) : null;
  const maxTemp =
    tmx != null ? Number(tmx) : tmpValues.length ? Math.max(...tmpValues) : null;

  const precipItems = getPrecipCategoryItems(dayItems)
    .map((item) => ({
      time: Number(item.fcstTime),
      value: Number(item.fcstValue),
    }))
    .filter((item) => Number.isFinite(item.time) && Number.isFinite(item.value));

  const amItems = precipItems.filter((item) => item.time >= 0 && item.time < 1200);
  const pmItems = precipItems.filter((item) => item.time >= 1200 && item.time <= 2400);

  const amPop = amItems.length ? Math.max(...amItems.map((item) => item.value)) : null;
  const pmPop = pmItems.length ? Math.max(...pmItems.map((item) => item.value)) : null;

  const amSky = pickHalfDayWeather(dayItems, 0, 1200, 900);
  const pmSky = pickHalfDayWeather(dayItems, 1200, 2400, 1500);

  return {
    date: targetDate,
    minTemp,
    maxTemp,
    sky: mergeMorningAfternoonWeather(amSky, pmSky),
    amSky,
    pmSky,
    amPop,
    pmPop,
  };
}

export function latLonToGrid(lat: number, lon: number) {
  const RE = 6371.00877;
  const GRID = 5.0;
  const SLAT1 = 30.0;
  const SLAT2 = 60.0;
  const OLON = 126.0;
  const OLAT = 38.0;
  const XO = 43;
  const YO = 136;

  const DEGRAD = Math.PI / 180.0;

  const re = RE / GRID;
  const slat1 = SLAT1 * DEGRAD;
  const slat2 = SLAT2 * DEGRAD;
  const olon = OLON * DEGRAD;
  const olat = OLAT * DEGRAD;

  let sn =
    Math.tan(Math.PI * 0.25 + slat2 * 0.5) /
    Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);

  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = (Math.pow(sf, sn) * Math.cos(slat1)) / sn;

  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = re * sf / Math.pow(ro, sn);

  let ra = Math.tan(Math.PI * 0.25 + lat * DEGRAD * 0.5);
  ra = re * sf / Math.pow(ra, sn);

  let theta = lon * DEGRAD - olon;
  if (theta > Math.PI) theta -= 2.0 * Math.PI;
  if (theta < -Math.PI) theta += 2.0 * Math.PI;
  theta *= sn;

  const nx = Math.floor(ra * Math.sin(theta) + XO + 0.5);
  const ny = Math.floor(ro - ra * Math.cos(theta) + YO + 0.5);

  return { nx, ny };
}

export function getMarkerPosition(city: string) {
  const fallback = { x: 50, y: 50 };
  const position = MAP_MARKER_POSITIONS[city] ?? fallback;

  return {
    left: `${position.x}%`,
    top: `${position.y}%`,
  };
}
