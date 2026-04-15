import { createHash } from "node:crypto";

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

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function kstDateYmd(now = new Date()): string {
  const kst = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const yyyy = kst.getFullYear();
  const mm = String(kst.getMonth() + 1).padStart(2, "0");
  const dd = String(kst.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

function kvBaseUrl() {
  return process.env.KV_REST_API_URL;
}

function kvToken() {
  return process.env.KV_REST_API_TOKEN;
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
  if (!response.ok) {
    throw new Error(`KV GET failed: ${response.status}`);
  }

  const json = (await response.json()) as { result?: T | null };
  return json.result ?? null;
}

export async function kvSet<T>(key: string, value: T, exSeconds?: number): Promise<void> {
  const baseUrl = kvBaseUrl();
  const token = kvToken();
  if (!baseUrl || !token) {
    throw new Error("KV env is not configured.");
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

  if (!response.ok) {
    throw new Error(`KV SET failed: ${response.status}`);
  }
}
