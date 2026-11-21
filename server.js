import http from "node:http";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import pg from "pg";

const { Pool } = pg;
const PORT = Number(process.env.PORT || 10000);
const TMDB_BASE = "https://api.themoviedb.org/3";
const SESSION_DAYS = 7;
const COOKIE_NAME = "pinapple_session";
const ALLOWED = [
  /^discover\/(movie|tv)$/,
  /^search\/(movie|tv)$/,
  /^trending\/(movie|tv)\/(day|week)$/,
  /^movie\/[0-9]+$/,
  /^tv\/[0-9]+$/
];

const databaseSsl = process.env.DATABASE_CA_CERT
  ? { ca: process.env.DATABASE_CA_CERT.replace(/\\n/g, "\n"), rejectUnauthorized: true }
  : { rejectUnauthorized: true };

const pool = process.env.DATABASE_URL ? new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: databaseSsl,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
}) : null;

const schema = `
CREATE TABLE IF NOT EXISTS students (
  id BIGSERIAL PRIMARY KEY,
  roll_number VARCHAR(4) UNIQUE NOT NULL CHECK (roll_number ~ '^[0-9]{4}$'),
  full_name VARCHAR(120) NOT NULL,
  role VARCHAR(16) NOT NULL DEFAULT 'student' CHECK (role IN ('student','admin')),
  password_hash TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS sessions (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  token_hash CHAR(64) UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sessions_student_id_idx ON sessions(student_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS student_invites (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  token_hash CHAR(64) UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

let databaseReady = false;
async function initialiseDatabase() {
  if (!pool) return;
  await pool.query(schema);
  await pool.query("DELETE FROM sessions WHERE expires_at < NOW()");
  databaseReady = true;
  console.log("PINAPPLE PostgreSQL schema is ready.");
}

const rateBuckets = new Map();
function rateLimit(key, limit = 8, windowMs = 15 * 60 * 1000) {
  const now = Date.now();
  const current = rateBuckets.get(key);
  if (!current || current.until <= now) {
    rateBuckets.set(key, { count: 1, until: now + windowMs });
    return true;
  }
  current.count += 1;
  return current.count <= limit;
}

function send(res, status, data, extraHeaders = {}) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extraHeaders });
  res.end(JSON.stringify(data));
}
function parseCookies(header = "") {
  return Object.fromEntries(header.split(";").map(part => {
    const index = part.indexOf("=");
    return index < 0 ? [part.trim(), ""] : [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }));
}
function hashToken(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
async function readBody(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 16384) throw new Error("Request too large");
  }
  return raw ? JSON.parse(raw) : {};
}
async function getSession(req) {
  if (!pool || !databaseReady) return null;
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
  if (!token) return null;
  const result = await pool.query(
    `SELECT s.id AS session_id, s.expires_at, st.id, st.roll_number, st.full_name, st.role
     FROM sessions s JOIN students st ON st.id = s.student_id
     WHERE s.token_hash = $1 AND s.expires_at > NOW() AND st.is_active = TRUE`,
    [hashToken(token)]
  );
  return result.rows[0] || null;
}
function cookie(value, maxAge) {
  return `${COOKIE_NAME}=${encodeURIComponent(value)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}
function requireDatabase(res) {
  if (!pool || !databaseReady) {
    send(res, 503, { error: "Student accounts are not configured yet. Connect the Supabase DATABASE_URL in Render and redeploy." });
    return false;
  }
  return true;
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  const allowedOrigins = (process.env.FRONTEND_ORIGIN || "https://pinapple.onrender.com").split(",").map(x => x.trim());
  if (origin && (allowedOrigins.includes(origin) || origin.startsWith("http://localhost:"))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-pinapple-bootstrap-key");
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }

  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (url.pathname === "/health" && req.method === "GET") {
    return send(res, 200, { ok: true, service: "PINAPPLE API", database: databaseReady ? "connected" : "not_configured" });
  }

  if (url.pathname === "/api/bootstrap" && req.method === "POST") {
    if (!requireDatabase(res)) return;
    const supplied = req.headers["x-pinapple-bootstrap-key"];
    if (!process.env.PINAPPLE_BOOTSTRAP_KEY || !supplied || supplied !== process.env.PINAPPLE_BOOTSTRAP_KEY) {
      return send(res, 403, { error: "Bootstrap is not authorised." });
    }
    try {
      const count = await pool.query("SELECT COUNT(*)::int AS count FROM students");
      if (count.rows[0].count !== 0) return send(res, 409, { error: "Initial setup has already been completed." });
      const body = await readBody(req);
      if (!Array.isArray(body.students) || body.students.length < 1 || body.students.length > 700) {
        return send(res, 400, { error: "Provide between 1 and 700 student records." });
      }
      const seen = new Set();
      for (const student of body.students) {
        const roll = String(student.rollNumber || "");
        const name = String(student.fullName || "").trim();
        const role = student.role === "admin" ? "admin" : "student";
        if (!/^\d{4}$/.test(roll) || !name || name.length > 120 || seen.has(roll)) {
          return send(res, 400, { error: "Each student needs a unique four-digit roll number and a name of up to 120 characters." });
        }
        seen.add(roll);
      }
      const client = await pool.connect();
      const invitations = [];
      try {
        await client.query("BEGIN");
        for (const student of body.students) {
          const roll = String(student.rollNumber);
          const name = String(student.fullName).trim();
          const role = student.role === "admin" ? "admin" : "student";
          const inserted = await client.query(
            "INSERT INTO students (roll_number, full_name, role) VALUES ($1,$2,$3) RETURNING id",
            [roll, name, role]
          );
          const inviteCode = crypto.randomBytes(24).toString("base64url");
          await client.query(
            "INSERT INTO student_invites (student_id, token_hash, expires_at) VALUES ($1,$2,NOW() + INTERVAL '7 days')",
            [inserted.rows[0].id, hashToken(inviteCode)]
          );
          invitations.push({ rollNumber: roll, fullName: name, role, inviteCode });
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
      return send(res, 201, { message: "Initial student records created. Save each invitation code securely; it is shown only once.", invitations });
    } catch (error) {
      console.error("Initial setup failed:", error.message);
      return send(res, 500, { error: "Initial student setup failed. No credentials were returned." });
    }
  }

  if (url.pathname.startsWith("/api/auth/")) {
    if (!requireDatabase(res)) return;
    try {
      if (url.pathname === "/api/auth/activate" && req.method === "POST") {
        const body = await readBody(req);
        const roll = String(body.rollNumber || "").trim();
        const inviteCode = String(body.inviteCode || "");
        const password = String(body.password || "");
        if (!/^\d{4}$/.test(roll) || inviteCode.length < 20 || password.length < 10 ||
            !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
          return send(res, 400, { error: "Use your four-digit roll number, valid invitation code, and a strong password (10+ characters with upper/lowercase, a number and a symbol)." });
        }
        const invite = await pool.query(
          `SELECT i.id AS invite_id, st.id AS student_id
           FROM student_invites i JOIN students st ON st.id = i.student_id
           WHERE st.roll_number = $1 AND i.token_hash = $2 AND i.used_at IS NULL AND i.expires_at > NOW() AND st.is_active = TRUE`,
          [roll, hashToken(inviteCode)]
        );
        if (!invite.rows[0]) return send(res, 400, { error: "Invitation is invalid, expired or already used." });
        const passwordHash = await bcrypt.hash(password, 12);
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          await client.query("UPDATE students SET password_hash = $1, updated_at = NOW() WHERE id = $2", [passwordHash, invite.rows[0].student_id]);
          await client.query("UPDATE student_invites SET used_at = NOW() WHERE id = $1", [invite.rows[0].invite_id]);
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
        return send(res, 200, { ok: true, message: "Account activated. You can now sign in." });
      }

      if (url.pathname === "/api/auth/login" && req.method === "POST") {
        const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
        if (!rateLimit("login:" + ip)) return send(res, 429, { error: "Too many sign-in attempts. Please wait 15 minutes." });
        const body = await readBody(req);
        const roll = String(body.rollNumber || "").trim();
        const password = String(body.password || "");
        if (!/^\d{4}$/.test(roll) || password.length < 8 || password.length > 200) {
          return send(res, 400, { error: "Enter your four-digit roll number and password." });
        }
        const result = await pool.query(
          "SELECT id, roll_number, full_name, role, password_hash FROM students WHERE roll_number = $1 AND is_active = TRUE",
          [roll]
        );
        const student = result.rows[0];
        if (!student?.password_hash || !(await bcrypt.compare(password, student.password_hash))) {
          return send(res, 401, { error: "The roll number or password is incorrect, or the account has not been activated." });
        }
        const token = crypto.randomBytes(32).toString("base64url");
        const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000);
        await pool.query("INSERT INTO sessions (student_id, token_hash, expires_at) VALUES ($1,$2,$3)", [student.id, hashToken(token), expiresAt]);
        return send(res, 200, { user: { rollNumber: student.roll_number, fullName: student.full_name, role: student.role } }, { "Set-Cookie": cookie(token, SESSION_DAYS * 86400) });
      }

      if (url.pathname === "/api/auth/me" && req.method === "GET") {
        const session = await getSession(req);
        if (!session) return send(res, 401, { error: "Not signed in." });
        return send(res, 200, { user: { rollNumber: session.roll_number, fullName: session.full_name, role: session.role } });
      }

      if (url.pathname === "/api/auth/logout" && req.method === "POST") {
        const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
        if (token) await pool.query("DELETE FROM sessions WHERE token_hash = $1", [hashToken(token)]);
        return send(res, 200, { ok: true }, { "Set-Cookie": cookie("", 0) });
      }

      return send(res, 404, { error: "Authentication route not found." });
    } catch (error) {
      console.error("Authentication request failed:", error.message);
      return send(res, 500, { error: "The authentication service encountered an error." });
    }
  }

  if (url.pathname === "/api/admin/students" && req.method === "GET") {
    if (!requireDatabase(res)) return;
    try {
      const session = await getSession(req);
      if (!session || session.role !== "admin") return send(res, 403, { error: "Administrator access required." });
      const result = await pool.query("SELECT roll_number AS \"rollNumber\", full_name AS \"fullName\", role, is_active AS \"isActive\", created_at AS \"createdAt\" FROM students ORDER BY full_name");
      return send(res, 200, { students: result.rows });
    } catch (error) {
      console.error("Admin request failed:", error.message);
      return send(res, 500, { error: "Could not load the student directory." });
    }
  }

  const imageMatch = url.pathname.match(/^\/api\/tmdb\/image\/(w[0-9]+|original)\/([A-Za-z0-9_-]+\.(?:jpg|jpeg|png|webp))$/i);
  if (imageMatch && req.method === "GET") {
    try {
      const imageUrl = `https://image.tmdb.org/t/p/${imageMatch[1]}/${imageMatch[2]}`;
      const upstream = await fetch(imageUrl, { signal: AbortSignal.timeout(12000) });
      if (!upstream.ok) return send(res, upstream.status, { error: "Image source unavailable" });
      const image = Buffer.from(await upstream.arrayBuffer());
      res.writeHead(200, { "Content-Type": upstream.headers.get("content-type") || "image/jpeg", "Cache-Control": "public, max-age=86400" });
      return res.end(image);
    } catch {
      return send(res, 502, { error: "Image source temporarily unavailable" });
    }
  }

  if (!url.pathname.startsWith("/api/tmdb/")) return send(res, 404, { error: "Not found" });
  if (req.method !== "GET") return send(res, 405, { error: "Method not allowed" });
  const endpoint = url.pathname.slice("/api/tmdb/".length);
  if (!ALLOWED.some(pattern => pattern.test(endpoint))) return send(res, 400, { error: "Unsupported TMDB endpoint" });
  const token = process.env.TMDB_ACCESS_TOKEN;
  if (!token) return send(res, 503, { error: "TMDB is not configured. Add TMDB_ACCESS_TOKEN to the pinapple-api Render service environment." });
  try {
    const target = new URL(`${TMDB_BASE}/${endpoint}`);
    for (const [key, value] of url.searchParams) {
      if (["api_key", "access_token"].includes(key.toLowerCase())) continue;
      target.searchParams.set(key, value);
    }
    if (!target.searchParams.has("language")) target.searchParams.set("language", "en-US");
    const upstream = await fetch(target, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, signal: AbortSignal.timeout(12000) });
    const body = await upstream.text();
    res.writeHead(upstream.status, { "Content-Type": "application/json", "Cache-Control": "public, max-age=300" });
    return res.end(body);
  } catch (error) {
    return send(res, 502, { error: "TMDB request failed", detail: error.name === "TimeoutError" ? "Upstream timeout" : "Upstream unavailable" });
  }
});

initialiseDatabase().catch(error => {
  databaseReady = false;
  console.error("PINAPPLE database initialisation failed:", error.message);
});
server.listen(PORT, "0.0.0.0", () => console.log(`PINAPPLE API listening on ${PORT}`));
