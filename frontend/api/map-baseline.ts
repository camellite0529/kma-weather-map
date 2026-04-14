type BaselineRow = {
  city: string;
  tomorrow: {
    minTemp: number | null;
    maxTemp: number | null;
    sky: string | null;
    amSky: string | null;
    pmSky: string | null;
    amPop: number | null;
    pmPop: number | null;
  };
};

type BaselinePayload = {
  date: string;
  rows: BaselineRow[];
};

function isValidDate(value: string): boolean {
  return /^\d{8}$/.test(value);
}

function kvKey(date: string): string {
  return `kma:map-baseline:${date}`;
}

async function kvGet(date: string): Promise<BaselinePayload | null> {
  const baseUrl = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!baseUrl || !token) return null;

  const response = await fetch(
    `${baseUrl}/get/${encodeURIComponent(kvKey(date))}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    },
  );
  if (!response.ok) {
    throw new Error(`KV GET failed: ${response.status}`);
  }

  const json = (await response.json()) as { result?: BaselinePayload | null };
  return json.result ?? null;
}

async function kvSet(date: string, payload: BaselinePayload): Promise<void> {
  const baseUrl = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!baseUrl || !token) {
    throw new Error("KV env is not configured.");
  }

  // 48h TTL: 날짜 변경 이후 자동 정리
  const response = await fetch(
    `${baseUrl}/set/${encodeURIComponent(kvKey(date))}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        value: payload,
        ex: 60 * 60 * 48,
      }),
    },
  );
  if (!response.ok) {
    throw new Error(`KV SET failed: ${response.status}`);
  }
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method === "GET") {
      const date = String(req.query?.date ?? "").trim();
      if (!isValidDate(date)) {
        res.status(400).json({ error: "Invalid date. Use YYYYMMDD." });
        return;
      }
      const payload = await kvGet(date);
      res.status(200).json({ ok: true, payload });
      return;
    }

    if (req.method === "POST") {
      const body = req.body as BaselinePayload;
      if (
        !body ||
        typeof body !== "object" ||
        !isValidDate(String(body.date ?? "")) ||
        !Array.isArray(body.rows)
      ) {
        res.status(400).json({ error: "Invalid payload." });
        return;
      }
      await kvSet(body.date, {
        date: body.date,
        rows: body.rows,
      });
      res.status(200).json({ ok: true });
      return;
    }

    res.setHeader("Allow", "GET,POST");
    res.status(405).json({ error: "Method not allowed." });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected server error";
    res.status(500).json({ error: message });
  }
}
