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
  속초: { x: 61.0, y: 8.4 },
  강릉: { x: 74.0, y: 19.0 },
  홍성: { x: 20.0, y: 39.0 },
  세종: { x: 31.8, y: 41.6 },
  청주: { x: 38.2, y: 39.2 },
  안동: { x: 66.0, y: 42.0 },
  대전: { x: 33.8, y: 48.0 },
  전주: { x: 27.0, y: 55.0 },
  대구: { x: 47.2, y: 55.3 },
  포항: { x: 80.4, y: 52.1 },
  울산: { x: 71.0, y: 60.0 },
  창원: { x: 67.0, y: 68.0 },
  부산: { x: 77.0, y: 69.0 },
  광주: { x: 22.6, y: 67.0 },
  목포: { x: 14.0, y: 75.2 },
  여수: { x: 47.0, y: 75.4 },
  제주: { x: 42.4, y: 92.2 },
  울릉도: { x: 70.0, y: 92.2 },
  독도: { x: 88.0, y: 92.2 },
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
  const now = new Date(Date.now() - 10 * 60 * 1000);
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
  const kstNow = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Seoul" })
  );
  kstNow.setDate(kstNow.getDate() + offsetDays);

  const yyyy = kstNow.getFullYear();
  const mm = String(kstNow.getMonth() + 1).padStart(2, "0");
  const dd = String(kstNow.getDate()).padStart(2, "0");

  return `${yyyy}${mm}${dd}`;
}

export function skyCodeToText(value: string | number | null | undefined) {
  const code = String(value ?? "");
  if (code === "1") return "맑음";
  if (code === "3") return "구름많음";
  if (code === "4") return "흐림";
  return null;
}

export function ptyCodeToText(value: string | number | null | undefined) {
  const code = String(value ?? "0");

  if (["1", "4", "5"].includes(code)) return "비";
  if (["2", "6"].includes(code)) return "비/눈";
  if (["3", "7"].includes(code)) return "눈";

  return null;
}

function pickRepresentativeWeather(
  items: ForecastItem[],
  targetDate: string,
): string | null {
  const dayItems = items.filter((item) => item.fcstDate === targetDate);

  const ptyItems = dayItems.filter((item) => item.category === "PTY");
  const nonZeroPtyItems = ptyItems.filter((item) => String(item.fcstValue) !== "0");
  const pickedPty = nonZeroPtyItems.sort((a, b) => {
    const diffA = Math.abs(Number(a.fcstTime) - 1200);
    const diffB = Math.abs(Number(b.fcstTime) - 1200);
    return diffA - diffB;
  })[0];

  const skyItems = dayItems.filter((item) => item.category === "SKY");
  const pickedSky = skyItems.sort((a, b) => {
    const diffA = Math.abs(Number(a.fcstTime) - 1200);
    const diffB = Math.abs(Number(b.fcstTime) - 1200);
    return diffA - diffB;
  })[0];

  return ptyCodeToText(pickedPty?.fcstValue) ?? skyCodeToText(pickedSky?.fcstValue);
}

function getPrecipCategoryItems(dayItems: ForecastItem[]) {
  return dayItems.filter(
    (item) => item.category === "POP" || item.category === "ST",
  );
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

  const amItems = precipItems.filter((item) => item.time >= 600 && item.time < 1200);
  const pmItems = precipItems.filter((item) => item.time >= 1200 && item.time <= 2100);

  const amPop = amItems.length ? Math.max(...amItems.map((item) => item.value)) : null;
  const pmPop = pmItems.length ? Math.max(...pmItems.map((item) => item.value)) : null;

  return {
    date: targetDate,
    minTemp,
    maxTemp,
    sky: pickRepresentativeWeather(items, targetDate),
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
