import {
  isKvConfigured,
  kvGet,
  kvSet,
  sha256Hex,
  userKeysKvKey,
  type RegisteredUserKey,
} from "./_baseline-common";

type UserKeyBody = {
  serviceKey?: string;
};

const KEY_LIST_LIMIT = 200;

function sanitizeServiceKey(value: unknown): string {
  return String(value ?? "").trim();
}

function mergeUserKeys(
  previous: RegisteredUserKey[] | null,
  next: RegisteredUserKey,
): RegisteredUserKey[] {
  const items = Array.isArray(previous) ? previous : [];
  const filtered = items.filter((item) => item.keyHash !== next.keyHash);
  return [next, ...filtered].slice(0, KEY_LIST_LIMIT);
}

function parseUserKeyBody(req: any): UserKeyBody | null {
  const raw = req.body;
  if (raw == null) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as UserKeyBody;
    } catch {
      return null;
    }
  }
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(raw)) {
    try {
      return JSON.parse(raw.toString("utf8")) as UserKeyBody;
    } catch {
      return null;
    }
  }
  if (typeof raw === "object") {
    return raw as UserKeyBody;
  }
  return null;
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      res.status(405).json({ error: "Method not allowed." });
      return;
    }

    if (!isKvConfigured()) {
      res.status(503).json({
        ok: false,
        error:
          "KV is not configured. In Vercel → Settings → Environment Variables, set either KV_REST_API_URL + KV_REST_API_TOKEN or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN, then redeploy.",
      });
      return;
    }

    const body = parseUserKeyBody(req);
    if (!body) {
      res.status(400).json({ error: "Invalid JSON body." });
      return;
    }
    const serviceKey = sanitizeServiceKey(body.serviceKey);
    if (!serviceKey) {
      res.status(400).json({ error: "Missing serviceKey." });
      return;
    }

    const keyHash = await sha256Hex(serviceKey);
    const next: RegisteredUserKey = {
      keyHash,
      serviceKey,
      updatedAt: new Date().toISOString(),
    };

    const previous = await kvGet<RegisteredUserKey[]>(userKeysKvKey());
    const merged = mergeUserKeys(previous, next);
    await kvSet(userKeysKvKey(), merged);

    res.status(200).json({ ok: true, keyHash });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected server error";
    res.status(500).json({ error: message });
  }
}
