export type DustLevel = "좋음" | "보통" | "나쁨" | "매우 나쁨";

export type DustRegionItem = {
  region: string;
  displayLabel: string;
  pm10: DustLevel;
  pm25: DustLevel;
};

type DustForecastItem = {
  dataTime?: string;
  informData?: string;
  informCode?: string;
  informGrade?: string;
};

const BASE_URL =
  "https://api.odcloud.kr/api/MinuDustFrcstDspthSvrc/v1/getMinuDustFrcstDspth";

const REGION_GROUPS = [
  { region: "서울", displayLabel: "서울", aliases: ["서울"] },
  { region: "인천", displayLabel: "인천", aliases: ["인천"] },
  { region: "경기북부", displayLabel: "경기\n북부", aliases: ["경기북부"] },
  { region: "경기남부", displayLabel: "경기\n남부", aliases: ["경기남부"] },
  { region: "강원", displayLabel: "강원", aliases: ["강원영서", "강원영동"] },
  { region: "대전충남", displayLabel: "대전\n충남", aliases: ["대전", "충남"] },
  { region: "세종충북", displayLabel: "세종\n충북", aliases: ["세종", "충북"] },
  { region: "전북", displayLabel: "전북", aliases: ["전북"] },
  { region: "광주전남", displayLabel: "광주\n전남", aliases: ["광주", "전남"] },
  { region: "대구경북", displayLabel: "대구\n경북", aliases: ["대구", "경북"] },
  { region: "부산경남", displayLabel: "부산\n경남", aliases: ["부산", "경남"] },
  { region: "제주", displayLabel: "제주", aliases: ["제주"] },
] as const;

function getTodayKST() {
  const now = new Date();
  const kst = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const yyyy = kst.getFullYear();
  const mm = String(kst.getMonth() + 1).padStart(2, "0");
  const dd = String(kst.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function normalizeServiceKey(rawKey: string) {
  return rawKey.trim();
}

function isLikelyEncodedKey(value: string) {
  return /%[0-9A-Fa-f]{2}/.test(value);
}

function normalizeDustLevel(text: string): DustLevel {
  if (text.includes("매우나쁨") || text.includes("매우 나쁨")) return "매우 나쁨";
  if (text.includes("나쁨")) return "나쁨";
  if (text.includes("보통")) return "보통";
  return "좋음";
}

function rank(level: DustLevel) {
  if (level === "좋음") return 1;
  if (level === "보통") return 2;
  if (level === "나쁨") return 3;
  return 4;
}

function worstOf(levels: DustLevel[]) {
  if (!levels.length) return "보통" as DustLevel;
  return [...levels].sort((a, b) => rank(b) - rank(a))[0];
}

function pickRegionGrade(informGrade: string, alias: string): DustLevel | null {
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`${escaped}\s*[:：]\s*(좋음|보통|나쁨|매우나쁨|매우 나쁨)`);
  const match = informGrade.match(regex);
  if (!match?.[1]) return null;
  return normalizeDustLevel(match[1]);
}

async function fetchForecast(informCode: "PM10" | "PM25") {
  const rawKey = process.env.AIRKOREA_SERVICE_KEY;

  if (!rawKey) {
    throw new Error("AIRKOREA_SERVICE_KEY 환경변수가 없습니다.");
  }

  const serviceKey = normalizeServiceKey(rawKey);

  const params = new URLSearchParams({
    returnType: "json",
    numOfRows: "100",
    pageNo: "1",
    searchDate: getTodayKST(),
    informCode,
  });

  const encodedServiceKey = isLikelyEncodedKey(serviceKey)
    ? serviceKey
    : encodeURIComponent(serviceKey);

  const res = await fetch(`${BASE_URL}?serviceKey=${encodedServiceKey}&${params.toString()}`, {
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`미세먼지 예보 API 호출 실패: ${res.status}`);
  }

  const json = await res.json();
  const items: DustForecastItem[] = json?.response?.body?.items ?? [];

  if (!Array.isArray(items) || items.length === 0) {
    throw new Error(`${informCode} 예보 데이터가 비어 있습니다.`);
  }

  return items.sort((a, b) =>
    `${b.informData ?? ""}|${b.dataTime ?? ""}`.localeCompare(
      `${a.informData ?? ""}|${a.dataTime ?? ""}`
    )
  )[0];
}

export async function getDustData() {
  const [pm10Data, pm25Data] = await Promise.all([
    fetchForecast("PM10"),
    fetchForecast("PM25"),
  ]);

  const pm10GradeText = pm10Data.informGrade ?? "";
  const pm25GradeText = pm25Data.informGrade ?? "";

  const regions: DustRegionItem[] = REGION_GROUPS.map((group) => ({
    region: group.region,
    displayLabel: group.displayLabel,
    pm10: worstOf(
      group.aliases
        .map((alias) => pickRegionGrade(pm10GradeText, alias))
        .filter((x): x is DustLevel => Boolean(x))
    ),
    pm25: worstOf(
      group.aliases
        .map((alias) => pickRegionGrade(pm25GradeText, alias))
        .filter((x): x is DustLevel => Boolean(x))
    ),
  }));

  return {
    dataTime: pm10Data.informData ?? pm10Data.dataTime ?? null,
    regions,
  };
}
