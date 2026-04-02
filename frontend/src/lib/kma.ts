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

export const MAP_CITIES: City[] = [
  { name: "서울", lat: 37.5665, lon: 126.978 },
  { name: "인천", lat: 37.4563, lon: 126.7052 },
  { name: "수원", lat: 37.2636, lon: 127.0286 },
  { name: "춘천", lat: 37.8813, lon: 127.7298 },
  { name: "속초", lat: 38.207, lon: 128.5918 },
  { name: "강릉", lat: 37.7519, lon: 128.8761 },
  { name: "홍성", lat: 36.6012, lon: 126.6608 },
  { name: "세종", lat: 36.48, lon: 127.289 },
  { name: "청주", lat: 36.6424, lon: 127.489 },
  { name: "안동", lat: 36.5684, lon: 128.7294 },
  { name: "대전", lat: 36.3504, lon: 127.3845 },
  { name: "전주", lat: 35.8242, lon: 127.148 },
  { name: "대구", lat: 35.8722, lon: 128.6025 },
  { name: "포항", lat: 36.019, lon: 129.3435 },
  { name: "울산", lat: 35.5384, lon: 129.3114 },
  { name: "창원", lat: 35.2285, lon: 128.6811 },
  { name: "부산", lat: 35.1796, lon: 129.0756 },
  { name: "광주", lat: 35.1595, lon: 126.8526 },
  { name: "목포", lat: 34.8118, lon: 126.3922 },
  { name: "여수", lat: 34.7604, lon: 127.6622 },
  { name: "제주", lat: 33.4996, lon: 126.5312 },
  { name: "울릉도", lat: 37.484, lon: 130.9057 },
  { name: "독도", lat: 37.2411, lon: 131.8644 },
];

export const TABLE_CITIES = [
  "서울",
  "인천",
  "춘천",
  "강릉",
  "대전",
  "세종",
  "청주",
  "광주",
  "전주",
  "부산",
  "울산",
  "대구",
  "제주",
];

export const MAP_MARKER_POSITIONS: Record<string, MarkerPosition> = {
  서울: { x: 31.5, y: 21.5 },
  인천: { x: 14.0, y: 23.2 },
  수원: { x: 30.8, y: 28.5 },
  춘천: { x: 50.0, y: 15.0 },
  속초: { x: 65.0, y: 8.4 },
  강릉: { x: 74.0, y: 19.0 },
  홍성: { x: 16.5, y: 41.0 },
  세종: { x: 33.5, y: 41.6 },
  청주: { x: 49.0, y: 38.5 },
  안동: { x: 69.0, y: 42.0 },
  대전: { x: 35.0, y: 48.0 },
  전주: { x: 32.0, y: 56.0 },
  대구: { x: 71.0, y: 55.3 },
  포항: { x: 87.0, y: 54.0 },
  울산: { x: 86.0, y: 63.0 },
  창원: { x: 67.0, y: 68.5 },
  부산: { x: 84.0, y: 70.0 },
  광주: { x: 23.0, y: 69.5 },
  목포: { x: 14.0, y: 78.0 },
  여수: { x: 47.0, y: 79.0 },
  제주: { x: 42.4, y: 92.2 },
  울릉도: { x: 68.0, y: 92.2 },
  독도: { x: 87.5, y: 92.2 },
};

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
