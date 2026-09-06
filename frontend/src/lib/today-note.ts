import { createTimeoutSignal } from "./api-utils";

export type TodayNotePayload = {
  title: string;
  body: string;
};

type TodayNotePayloadLike = Partial<{
  title: string;
  body: string;
  short: string;
  long: string;
  shortText: string;
  longText: string;
}>;

function normalizeTodayNotePayload(raw: unknown): TodayNotePayload | null {
  if (!raw || typeof raw !== "object") return null;

  const source = raw as TodayNotePayloadLike;
  const title = [source.title, source.shortText, source.short].find(
    (value): value is string => typeof value === "string",
  );
  const body = [source.body, source.longText, source.long].find(
    (value): value is string => typeof value === "string",
  );

  if (title == null && body == null) return null;
  return {
    title: title ?? "",
    body: body ?? "",
  };
}

function todayNoteApiOrigin(): string {
  if (import.meta.env.DEV) {
    return `${window.location.origin}/api`;
  }
  return `${window.location.origin}/api`;
}

const REQUEST_TIMEOUT_MS = 12000;

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  externalSignal?: AbortSignal,
): Promise<Response> {
  const { signal, cleanup } = createTimeoutSignal(REQUEST_TIMEOUT_MS, externalSignal);
  try {
    return await fetch(url, { ...init, signal });
  } finally {
    cleanup();
  }
}

export async function getTodayNote(
  apiKey: string,
  date: string,
  signal?: AbortSignal,
): Promise<TodayNotePayload | null> {
  const url = `${todayNoteApiOrigin()}/today-note?date=${encodeURIComponent(date)}`;
  const response = await fetchWithTimeout(
    url,
    {
      method: "GET",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "x-kma-service-key": apiKey,
      },
    },
    signal,
  );
  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error(`Failed to fetch today note: ${response.status}`);
  }
  const data = await response.json();
  if (data.ok && data.payload) {
    return normalizeTodayNotePayload(data.payload);
  }
  return null;
}

export async function saveTodayNote(apiKey: string, title: string, body: string): Promise<void> {
  const url = `${todayNoteApiOrigin()}/today-note`;
  const response = await fetchWithTimeout(url, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "x-kma-service-key": apiKey,
    },
    body: JSON.stringify({
      title,
      body,
      shortText: title,
      longText: body,
    }),
  });
  if (!response.ok) {
    throw new Error(`Failed to save today note: ${response.status}`);
  }
  const data = await response.json();
  if (!data.ok) {
    throw new Error(`Save failed: ${data.error}`);
  }
}
