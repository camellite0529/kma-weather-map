import {
  baselineKvKey,
  isKvConfigured,
  isValidDate,
  isValidKeyHash,
  kvGet,
  kvSet,
  sha256Hex,
  type BaselinePayload,
} from "./_baseline-common";

const BASELINE_TTL_SECONDS = 60 * 60 * 48;

function parseRequestBody(req: any): BaselinePayload | null {
  const raw = req.body;
  if (raw == null) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as BaselinePayload;
    } catch {
      return null;
    }
  }
  if (raw instanceof Uint8Array) {
    try {
      return JSON.parse(new TextDecoder().decode(raw)) as BaselinePayload;
    } catch {
      return null;
    }
  }
  if (typeof raw === "object") {
    return raw as BaselinePayload;
  }
  return null;
}

function headerValue(headers: any, key: string): string {
  const raw = headers?.[key] ?? headers?.[key.toLowerCase()] ?? "";
  return String(raw).trim();
}

async function resolveKeyHash(req: any): Promise<string | null> {
  const keyHashQuery = String(req.query?.keyHash ?? "").trim();
  if (isValidKeyHash(keyHashQuery)) return keyHashQuery;

  const serviceKey = headerValue(req.headers, "x-kma-service-key");
  if (serviceKey) return await sha256Hex(serviceKey);

  // Backward compatibility for older baseline format without per-user partition
  return null;
}

export default async function handler(req: any, res: any) {
  try {
    const keyHash = await resolveKeyHash(req);

    if (req.method === "GET") {
      const date = String(req.query?.date ?? "").trim();
      if (!isValidDate(date)) {
        res.status(400).json({ error: "Invalid date. Use YYYYMMDD." });
        return;
      }
      if (!keyHash) {
        res.status(200).json({ ok: true, payload: null });
        return;
      }
      const payload = await kvGet<BaselinePayload>(baselineKvKey(date, keyHash));
      res.status(200).json({ ok: true, payload });
      return;
    }

    if (req.method === "POST") {
      const body = parseRequestBody(req);
      if (
        !body ||
        typeof body !== "object" ||
        !isValidDate(String(body.date ?? "")) ||
        !Array.isArray(body.rows)
      ) {
        res.status(400).json({ error: "Invalid payload." });
        return;
      }
      if (!keyHash) {
        res.status(400).json({ error: "Missing key context." });
        return;
      }
      if (!isKvConfigured()) {
        res.status(503).json({
          ok: false,
          error:
            "KV is not configured. Set KV_REST_API_URL + KV_REST_API_TOKEN or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN, then redeploy.",
        });
        return;
      }
      await kvSet(
        baselineKvKey(body.date, keyHash),
        {
          date: body.date,
          rows: body.rows,
        },
        BASELINE_TTL_SECONDS,
      );
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
