import {
  baselineKvKey,
  isValidDate,
  isValidKeyHash,
  kvGet,
  kvSet,
  sha256Hex,
  type BaselinePayload,
} from "./_baseline-common";

const BASELINE_TTL_SECONDS = 60 * 60 * 48;

function headerValue(headers: any, key: string): string {
  const raw = headers?.[key] ?? headers?.[key.toLowerCase()] ?? "";
  return String(raw).trim();
}

function resolveKeyHash(req: any): string | null {
  const keyHashQuery = String(req.query?.keyHash ?? "").trim();
  if (isValidKeyHash(keyHashQuery)) return keyHashQuery;

  const serviceKey = headerValue(req.headers, "x-kma-service-key");
  if (serviceKey) return sha256Hex(serviceKey);

  // Backward compatibility for older baseline format without per-user partition
  return null;
}

export default async function handler(req: any, res: any) {
  try {
    const keyHash = resolveKeyHash(req);

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
      if (!keyHash) {
        res.status(400).json({ error: "Missing key context." });
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
