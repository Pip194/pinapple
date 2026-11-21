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
ALTER TABLE students ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS sessions (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  token_hash CHAR(64) UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sessions_student_id_idx ON sessions(student_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS moderation_reports (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  category VARCHAR(40) NOT NULL,
  details TEXT NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewing','resolved','dismissed')),
  admin_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_by BIGINT REFERENCES students(id)
);
CREATE INDEX IF NOT EXISTS moderation_reports_status_idx ON moderation_reports(status, created_at DESC);
CREATE TABLE IF NOT EXISTS student_invites (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  token_hash CHAR(64) UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_conversations (
  id BIGSERIAL PRIMARY KEY,
  kind VARCHAR(8) NOT NULL CHECK (kind IN ('direct','group')),
  title VARCHAR(80),
  created_by BIGINT NOT NULL REFERENCES students(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS chat_participants (
  conversation_id BIGINT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (conversation_id, student_id)
);
CREATE INDEX IF NOT EXISTS chat_participants_student_idx ON chat_participants(student_id, conversation_id);
CREATE TABLE IF NOT EXISTS chat_messages (
  id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  sender_id BIGINT NOT NULL REFERENCES students(id),
  body VARCHAR(2000) NOT NULL CHECK (length(trim(body)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS chat_messages_conversation_idx ON chat_messages(conversation_id, created_at DESC);
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
  return `${COOKIE_NAME}=${encodeURIComponent(value)}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=${maxAge}`;
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
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
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

  if (url.pathname === "/api/presence/heartbeat" && req.method === "POST") {
    if (!requireDatabase(res)) return;
    try {
      const session = await getSession(req);
      if (!session) return send(res, 401, { error: "Not signed in." });
      await pool.query("UPDATE students SET last_seen_at = NOW() WHERE id = $1", [session.id]);
      return send(res, 200, { ok: true });
    } catch (error) {
      console.error("Presence heartbeat failed:", error.message);
      return send(res, 500, { error: "Could not update online status." });
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
            !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
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

  if (url.pathname === "/api/reports" && req.method === "POST") {
    if (!requireDatabase(res)) return;
    try {
      const session = await getSession(req);
      if (!session) return send(res, 401, { error: "Not signed in." });
      const body = await readBody(req);
      const category = String(body.category || "").trim();
      const details = String(body.details || "").trim();
      if (!["Bullying or harassment","Inappropriate content","Safety concern","Account issue","Other"].includes(category) || details.length < 10 || details.length > 2000) {
        return send(res, 400, { error: "Choose a report category and provide 10–2000 characters of detail." });
      }
      const result = await pool.query("INSERT INTO moderation_reports (student_id, category, details) VALUES ($1,$2,$3) RETURNING id, status, created_at AS \"createdAt\"", [session.id, category, details]);
      return send(res, 201, { report: result.rows[0] });
    } catch (error) {
      console.error("Report submission failed:", error.message);
      return send(res, 500, { error: "Could not submit your report." });
    }
  }

  if (url.pathname === "/api/admin/reports" && req.method === "GET") {
    if (!requireDatabase(res)) return;
    try {
      const session = await getSession(req);
      if (!session || session.role !== "admin") return send(res, 403, { error: "Administrator access required." });
      const result = await pool.query("SELECT r.id, r.category, r.details, r.status, r.admin_note AS \"adminNote\", r.created_at AS \"createdAt\", r.updated_at AS \"updatedAt\", st.roll_number AS \"rollNumber\", st.full_name AS \"fullName\" FROM moderation_reports r JOIN students st ON st.id = r.student_id ORDER BY CASE r.status WHEN 'open' THEN 0 WHEN 'reviewing' THEN 1 ELSE 2 END, r.created_at DESC LIMIT 200");
      return send(res, 200, { reports: result.rows });
    } catch (error) {
      console.error("Moderation queue failed:", error.message);
      return send(res, 500, { error: "Could not load moderation reports." });
    }
  }

  const reportAction = url.pathname.match(/^\/api\/admin\/reports\/([0-9]+)$/);
  if (reportAction && req.method === "PATCH") {
    if (!requireDatabase(res)) return;
    try {
      const session = await getSession(req);
      if (!session || session.role !== "admin") return send(res, 403, { error: "Administrator access required." });
      const body = await readBody(req);
      const status = String(body.status || "");
      const note = String(body.adminNote || "").trim().slice(0, 1000);
      if (!["open","reviewing","resolved","dismissed"].includes(status)) return send(res, 400, { error: "Invalid report status." });
      const result = await pool.query("UPDATE moderation_reports SET status = $1, admin_note = $2, updated_at = NOW(), resolved_by = $3 WHERE id = $4 RETURNING id, status, admin_note AS \"adminNote\", updated_at AS \"updatedAt\"", [status, note || null, session.id, Number(reportAction[1])]);
      if (!result.rows[0]) return send(res, 404, { error: "Report not found." });
      return send(res, 200, { report: result.rows[0] });
    } catch (error) {
      console.error("Moderation update failed:", error.message);
      return send(res, 500, { error: "Could not update the report." });
    }
  }

  const studentAction = url.pathname.match(/^\/api\/admin\/students\/([0-9]{4})$/);
  if (studentAction && req.method === "PATCH") {
    if (!requireDatabase(res)) return;
    try {
      const session = await getSession(req);
      if (!session || session.role !== "admin") return send(res, 403, { error: "Administrator access required." });
      const target = await pool.query("SELECT id, role, is_active FROM students WHERE roll_number = $1", [studentAction[1]]);
      if (!target.rows[0]) return send(res, 404, { error: "Student account not found." });
      const body = await readBody(req);
      const current = target.rows[0];
      const nextActive = typeof body.isActive === "boolean" ? body.isActive : current.is_active;
      const nextRole = ["admin","student"].includes(body.role) ? body.role : current.role;
      if (session.id === current.id && (!nextActive || nextRole !== "admin")) return send(res, 400, { error: "You cannot disable or remove your own administrator access." });
      if (current.role === "admin" && (nextRole !== "admin" || !nextActive)) {
        const admins = await pool.query("SELECT COUNT(*)::int AS count FROM students WHERE role = 'admin' AND is_active = TRUE");
        if (admins.rows[0].count <= 1) return send(res, 400, { error: "At least one active administrator must remain." });
      }
      const result = await pool.query("UPDATE students SET is_active = $1, role = $2, updated_at = NOW() WHERE id = $3 RETURNING roll_number AS \"rollNumber\", full_name AS \"fullName\", role, is_active AS \"isActive\"", [nextActive, nextRole, current.id]);
      return send(res, 200, { student: result.rows[0] });
    } catch (error) {
      console.error("Account update failed:", error.message);
      return send(res, 500, { error: "Could not update the student account." });
    }
  }

  if (url.pathname === "/api/admin/students" && req.method === "GET") {
    if (!requireDatabase(res)) return;
    try {
      const session = await getSession(req);
      if (!session || session.role !== "admin") return send(res, 403, { error: "Administrator access required." });
      const result = await pool.query("SELECT roll_number AS \"rollNumber\", full_name AS \"fullName\", role, is_active AS \"isActive\", created_at AS \"createdAt\", (last_seen_at >= NOW() - INTERVAL '90 seconds') AS \"isOnline\", last_seen_at AS \"lastSeenAt\" FROM students ORDER BY full_name");
      return send(res, 200, { students: result.rows });
    } catch (error) {
      console.error("Admin request failed:", error.message);
      return send(res, 500, { error: "Could not load the student directory." });
    }
  }


  if (url.pathname.startsWith("/api/chat/")) {
    if (!requireDatabase(res)) return;
    try {
      const session = await getSession(req);
      if (!session) return send(res, 401, { error: "Not signed in." });

      if (url.pathname === "/api/chat/students" && req.method === "GET") {
        const q = String(url.searchParams.get("q") || "").trim().slice(0, 80);
        const like = "%" + q.replace(/[\\%_]/g, "\\  const imageMatch = url.pathname.match(/^\/api\/tmdb\/image\/") + "%";
        const result = await pool.query(
          "SELECT roll_number AS \"rollNumber\", full_name AS \"fullName\" FROM students WHERE is_active = TRUE AND id <> $1 AND ($2 = '' OR full_name ILIKE $3 OR roll_number ILIKE $3) ORDER BY full_name LIMIT 30",
          [session.id, q, like]
        );
        return send(res, 200, { students: result.rows });
      }

      if (url.pathname === "/api/chat/conversations" && req.method === "GET") {
        const result = await pool.query(
          `SELECT c.id, c.kind, c.title, c.created_at AS "createdAt",
            (SELECT string_agg(st.full_name, ', ' ORDER BY st.full_name)
             FROM chat_participants p2 JOIN students st ON st.id = p2.student_id
             WHERE p2.conversation_id = c.id AND p2.student_id <> $1) AS "participantNames",
            (SELECT m.body FROM chat_messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS "lastMessage",
            (SELECT m.created_at FROM chat_messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS "lastMessageAt",
            (SELECT COUNT(*)::int FROM chat_messages m WHERE m.conversation_id = c.id AND m.sender_id <> $1 AND m.created_at > p.last_read_at) AS "unreadCount"
           FROM chat_conversations c JOIN chat_participants p ON p.conversation_id = c.id
           WHERE p.student_id = $1
           ORDER BY COALESCE((SELECT MAX(m.created_at) FROM chat_messages m WHERE m.conversation_id = c.id), c.created_at) DESC
           LIMIT 100`,
          [session.id]
        );
        return send(res, 200, { conversations: result.rows });
      }

      if (url.pathname === "/api/chat/conversations" && req.method === "POST") {
        const body = await readBody(req);
        const rolls = Array.isArray(body.participantRollNumbers) ? body.participantRollNumbers.map(x => String(x)) : [];
        const uniqueRolls = [...new Set([session.roll_number, ...rolls])];
        if (uniqueRolls.length < 2 || uniqueRolls.length > 20 || uniqueRolls.some(x => !/^\\d{4}$/.test(x))) {
          return send(res, 400, { error: "Choose between 1 and 19 other PINAPPLE accounts." });
        }
        const found = await pool.query(
          "SELECT id, roll_number FROM students WHERE is_active = TRUE AND roll_number = ANY($1::varchar[])",
          [uniqueRolls]
        );
        if (found.rows.length !== uniqueRolls.length) return send(res, 400, { error: "One or more selected accounts are unavailable." });
        const kind = uniqueRolls.length === 2 ? "direct" : "group";
        const title = kind === "group" ? String(body.title || "").trim().slice(0, 80) || null : null;
        const client = await pool.connect();
        let conversationId;
        try {
          await client.query("BEGIN");
          const created = await client.query(
            "INSERT INTO chat_conversations (kind, title, created_by) VALUES ($1,$2,$3) RETURNING id",
            [kind, title, session.id]
          );
          conversationId = created.rows[0].id;
          for (const student of found.rows) {
            await client.query("INSERT INTO chat_participants (conversation_id, student_id) VALUES ($1,$2)", [conversationId, student.id]);
          }
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
        return send(res, 201, { conversationId });
      }

      const messagesMatch = url.pathname.match(/^\\/api\\/chat\\/conversations\\/([0-9]+)\\/messages$/);
      if (messagesMatch && req.method === "GET") {
        const conversationId = Number(messagesMatch[1]);
        const member = await pool.query("SELECT 1 FROM chat_participants WHERE conversation_id = $1 AND student_id = $2", [conversationId, session.id]);
        if (!member.rows[0]) return send(res, 403, { error: "You are not a member of this conversation." });
        await pool.query("UPDATE chat_participants SET last_read_at = NOW() WHERE conversation_id = $1 AND student_id = $2", [conversationId, session.id]);
        const result = await pool.query(
          `SELECT m.id, m.body, m.created_at AS "createdAt", st.roll_number AS "senderRollNumber", st.full_name AS "senderName"
           FROM (SELECT * FROM chat_messages WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 100) m
           JOIN students st ON st.id = m.sender_id ORDER BY m.created_at ASC`,
          [conversationId]
        );
        return send(res, 200, { messages: result.rows });
      }

      if (messagesMatch && req.method === "POST") {
        const conversationId = Number(messagesMatch[1]);
        const member = await pool.query("SELECT 1 FROM chat_participants WHERE conversation_id = $1 AND student_id = $2", [conversationId, session.id]);
        if (!member.rows[0]) return send(res, 403, { error: "You are not a member of this conversation." });
        const body = await readBody(req);
        const message = String(body.message || "").trim();
        if (!message || message.length > 2000) return send(res, 400, { error: "Messages must contain 1–2000 characters." });
        const result = await pool.query(
          `INSERT INTO chat_messages (conversation_id, sender_id, body) VALUES ($1,$2,$3)
           RETURNING id, body, created_at AS "createdAt"`,
          [conversationId, session.id, message]
        );
        await pool.query("UPDATE chat_participants SET last_read_at = NOW() WHERE conversation_id = $1 AND student_id = $2", [conversationId, session.id]);
        return send(res, 201, { message: { ...result.rows[0], senderRollNumber: session.roll_number, senderName: session.full_name } });
      }

      return send(res, 404, { error: "Chat route not found." });
    } catch (error) {
      console.error("Chat request failed:", error.message);
      return send(res, 500, { error: "The chat service encountered an error." });
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
