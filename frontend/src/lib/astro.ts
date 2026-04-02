import astroQueryJson from "../../data/astro-query.json";

export type AstroTimes = {
  sunrise: string | null;
  sunset: string | null;
  moonrise: string | null;
  moonset: string | null;
};

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

function getTomorrowDateKST() {
  const now = new Date();
  const kst = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  kst.setDate(kst.getDate() + 1);

  const yyyy = kst.getFullYear();
  const mm = String(kst.getMonth() + 1).padStart(2, "0");
  const dd = String(kst.getDate()).padStart(2, "0");

  return `${yyyy}${mm}${dd}`;
}

export async function getAstroTimes(kasiServiceKey: string): Promise<AstroTimes> {
  const serviceKey = kasiServiceKey.trim();

  const encodedServiceKey = /%[0-9A-Fa-f]{2}/.test(serviceKey)
    ? serviceKey
    : encodeURIComponent(serviceKey);

  const params = new URLSearchParams({
    locdate: getTomorrowDateKST(),
    location: astroQueryJson.location,
  });

  const url = `${kasiApiOrigin()}/B090041/openapi/service/RiseSetInfoService/getAreaRiseSetInfo?serviceKey=${encodedServiceKey}&${params.toString()}`;

  const res = await fetch(url, { cache: "no-store" });

  if (!res.ok) {
    throw new Error(`출몰시각 API 호출 실패: ${res.status}`);
  }

  const xml = await res.text();

  const pick = (tag: string) => {
    const match = xml.match(new RegExp(`<${tag}>(.*?)</${tag}>`));
    return match?.[1]?.trim() ?? null;
  };

  return {
    sunrise: formatHHMM(pick("sunrise")),
    sunset: formatHHMM(pick("sunset")),
    moonrise: formatHHMM(pick("moonrise")),
    moonset: formatHHMM(pick("moonset")),
  };
}
