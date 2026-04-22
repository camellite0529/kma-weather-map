export function isLikelyEncodedKey(value: string) {
  return /%[0-9A-Fa-f]{2}/.test(value);
}

export function normalizeServiceKey(rawKey: string) {
  return rawKey.trim();
}
