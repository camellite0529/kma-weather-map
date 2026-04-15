import {
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

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      res.status(405).json({ error: "Method not allowed." });
      return;
    }

    const body = req.body as UserKeyBody;
    const serviceKey = sanitizeServiceKey(body?.serviceKey);
    if (!serviceKey) {
      res.status(400).json({ error: "Missing serviceKey." });
      return;
    }

    const keyHash = sha256Hex(serviceKey);
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
