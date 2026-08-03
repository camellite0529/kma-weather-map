const TARGET_ORIGIN = "https://apis.data.go.kr";
const REQUEST_TIMEOUT_MS = 12000;

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timeout);
  }
}

function buildTargetUrl(req: any): string | null {
  const segments = req.query?.path;
  const pathParts = Array.isArray(segments) ? segments : segments ? [segments] : [];
  if (pathParts.length === 0) return null;

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query ?? {})) {
    if (key === "path") continue;
    if (Array.isArray(value)) {
      for (const v of value) search.append(key, String(v));
    } else if (value != null) {
      search.append(key, String(value));
    }
  }

  const path = pathParts.map((part: string) => encodeURIComponent(part)).join("/");
  const qs = search.toString();
  return `${TARGET_ORIGIN}/${path}${qs ? `?${qs}` : ""}`;
}

// apis.data.go.kr는 브라우저 CORS 헤더를 내려주지 않아 프로덕션에서 직접 호출이 막힌다.
// 같은 오리진의 이 서버리스 함수가 대신 호출해 응답을 그대로 전달한다.
export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method not allowed." });
    return;
  }

  const targetUrl = buildTargetUrl(req);
  if (!targetUrl) {
    res.status(400).json({ error: "Missing upstream path." });
    return;
  }

  try {
    const upstream = await fetchWithTimeout(targetUrl);
    const body = await upstream.text();
    res.status(upstream.status);
    res.setHeader(
      "Content-Type",
      upstream.headers.get("content-type") ?? "application/json; charset=utf-8",
    );
    res.send(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown proxy error";
    res.status(502).json({ error: `Upstream fetch failed: ${message}` });
  }
}
