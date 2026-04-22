export type TodayNotePayload = {
  title: string;
  body: string;
};

function todayNoteApiOrigin(): string {
  if (import.meta.env.DEV) {
    return `${window.location.origin}/api`;
  }
  return `${window.location.origin}/api`;
}

export async function getTodayNote(apiKey: string, date: string): Promise<TodayNotePayload | null> {
  const url = `${todayNoteApiOrigin()}/today-note?date=${encodeURIComponent(date)}`;
  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "x-kma-service-key": apiKey,
    },
  });
  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error(`Failed to fetch today note: ${response.status}`);
  }
  const data = await response.json();
  if (data.ok && data.payload) {
    return data.payload;
  }
  return null;
}

export async function saveTodayNote(apiKey: string, title: string, body: string): Promise<void> {
  const url = `${todayNoteApiOrigin()}/today-note`;
  const response = await fetch(url, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "x-kma-service-key": apiKey,
    },
    body: JSON.stringify({ title, body }),
  });
  if (!response.ok) {
    throw new Error(`Failed to save today note: ${response.status}`);
  }
  const data = await response.json();
  if (!data.ok) {
    throw new Error(`Save failed: ${data.error}`);
  }
}
