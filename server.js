import http from "node:http";

const PORT = Number(process.env.PORT || 10000);
const TMDB_BASE = "https://api.themoviedb.org/3";
const ALLOWED = [
  /^discover\/(movie|tv)$/,
  /^search\/(movie|tv)$/,
  /^trending\/(movie|tv)\/(day|week)$/,
  /^movie\/[0-9]+$/,
  /^tv\/[0-9]+$/
];

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }

  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ ok: true, service: "pinApple Cinema API" }));
  }
  if (!url.pathname.startsWith("/api/tmdb/")) {
    res.writeHead(404, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Not found" }));
  }
  if (req.method !== "GET") {
    res.writeHead(405, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Method not allowed" }));
  }
  const endpoint = url.pathname.slice("/api/tmdb/".length);
  if (!ALLOWED.some(pattern => pattern.test(endpoint))) {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Unsupported TMDB endpoint" }));
  }
  const token = process.env.TMDB_ACCESS_TOKEN;
  if (!token) {
    res.writeHead(503, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "TMDB is not configured. Add TMDB_ACCESS_TOKEN to the pinapple-api Render service environment." }));
  }
  try {
    const target = new URL(`${TMDB_BASE}/${endpoint}`);
    for (const [key, value] of url.searchParams) {
      if (["api_key", "access_token"].includes(key.toLowerCase())) continue;
      target.searchParams.set(key, value);
    }
    if (!target.searchParams.has("language")) target.searchParams.set("language", "en-US");
    const upstream = await fetch(target, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(12000)
    });
    const body = await upstream.text();
    res.writeHead(upstream.status, { "Content-Type": "application/json", "Cache-Control": "public, max-age=300" });
    return res.end(body);
  } catch (error) {
    res.writeHead(502, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "TMDB request failed", detail: error.name === "TimeoutError" ? "Upstream timeout" : "Upstream unavailable" }));
  }
});

server.listen(PORT, "0.0.0.0", () => console.log(`pinApple Cinema API listening on ${PORT}`));
