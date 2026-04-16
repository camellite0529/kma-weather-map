export type BaselineDailyWeather = {
  minTemp: number | null;
  maxTemp: number | null;
  sky: string | null;
  amSky: string | null;
  pmSky: string | null;
  amPop: number | null;
  pmPop: number | null;
};

export type BaselineRow = {
  city: string;
  tomorrow: BaselineDailyWeather;
  dayAfterTomorrow: BaselineDailyWeather;
  threeDaysLater: BaselineDailyWeather;
};

export type BaselinePayload = {
  date: string;
  rows: BaselineRow[];
};

export type RegisteredUserKey = {
  keyHash: string;
  serviceKey: string;
  updatedAt: string;
};

export function isValidDate(value: string): boolean {
  return /^\d{8}$/.test(value);
}

export function isValidKeyHash(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value);
}

function digestToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Edge/Node 공통: Web Crypto만 사용해 런타임 충돌을 피한다.
 */
export async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);

  const globalSubtle = globalThis.crypto?.subtle;
  if (globalSubtle) {
    return digestToHex(await globalSubtle.digest("SHA-256", data));
  }
  throw new Error("Web Crypto API is unavailable in this runtime.");
}

export function kstDateYmd(now = new Date()): string {
  const kst = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const yyyy = kst.getFullYear();
  const mm = String(kst.getMonth() + 1).padStart(2, "0");
  const dd = String(kst.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

/** Vercel KV / 수동 설정 이름 + Upstash 대시보드 기본 이름 모두 지원 */
function envValue(name: string): string {
  const env = (globalThis as any)?.process?.env;
  return String(env?.[name] ?? "").trim();
}

function kvBaseUrl(): string {
  const raw = String(
    envValue("KV_REST_API_URL") ||
      envValue("UPSTASH_REDIS_REST_URL") ||
      "",
  ).trim();
  return raw.replace(/\/+$/, "");
}

function kvToken(): string {
  return String(
    envValue("KV_REST_API_TOKEN") ||
      envValue("UPSTASH_REDIS_REST_TOKEN") ||
      "",
  ).trim();
}

export function isKvConfigured(): boolean {
  return Boolean(kvBaseUrl() && kvToken());
}

export function baselineKvKey(date: string, keyHash: string): string {
  return `kma:map-baseline:${date}:${keyHash}`;
}

export function userKeysKvKey(): string {
  return "kma:user-keys";
}

export async function kvGet<T>(key: string): Promise<T | null> {
  const baseUrl = kvBaseUrl();
  const token = kvToken();
  if (!baseUrl || !token) return null;

  const response = await fetch(`${baseUrl}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const text = await response.text();
  if (!response.ok) {
    // Upstash: missing key is often 404; treat as empty baseline
    if (response.status === 404) return null;
    throw new Error(
      `KV GET failed: ${response.status} ${text.slice(0, 200)}`.trim(),
    );
  }

  let json: { result?: T | null };
  try {
    json = JSON.parse(text) as { result?: T | null };
  } catch {
    throw new Error(`KV GET invalid JSON: ${text.slice(0, 200)}`);
  }
  return json.result ?? null;
}

export async function kvSet<T>(key: string, value: T, exSeconds?: number): Promise<void> {
  const baseUrl = kvBaseUrl();
  const token = kvToken();
  if (!baseUrl || !token) {
    throw new Error(
      "KV is not configured. Set KV_REST_API_URL + KV_REST_API_TOKEN, or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN.",
    );
  }

  const body: { value: T; ex?: number } = { value };
  if (typeof exSeconds === "number" && Number.isFinite(exSeconds) && exSeconds > 0) {
    body.ex = exSeconds;
  }

  const response = await fetch(`${baseUrl}/set/${encodeURIComponent(key)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `KV SET failed: ${response.status} ${text.slice(0, 200)}`.trim(),
    );
  }
}
