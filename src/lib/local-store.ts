import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type LocalUser = { id: string; name: string; email: string };
export type ProgressEntry = { status?: "done" | "todo" | "ignored"; favorite?: boolean; note?: string };
export type LocalProgress = Record<string, ProgressEntry>;
type Account = LocalUser & { password: string };
type SqlRow = Record<string, string | number | null>;

const cookieName = "how_local_session";
const sessionSeconds = 60 * 60 * 24 * 30;
export const sourceTopicId = "06f89854-021f-4226-a87c-456558b96d3b";
export const forumCategories = ["lifestyle", "tools", "practice", "ask", "feedback"] as const;
const globalStore = globalThis as typeof globalThis & { howBetterDatabase?: DatabaseSync };

/** A local, single-server store. Deployments need a persistent writable volume. */
function database() {
  if (globalStore.howBetterDatabase) return globalStore.howBetterDatabase;
  const directory = process.env.HOW_LOCAL_DATA_DIR || join(process.cwd(), ".data");
  mkdirSync(directory, { recursive: true });
  const db = new DatabaseSync(join(directory, "howtolivebetter.sqlite"));
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
      password TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS progress (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      data TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS topics (
      id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id), name TEXT NOT NULL,
      title TEXT NOT NULL, body TEXT NOT NULL, category TEXT NOT NULL, created_at TEXT NOT NULL,
      source INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS replies (
      id TEXT PRIMARY KEY, topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS thanks (
      topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id), PRIMARY KEY(topic_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY, topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id), reason TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS conversations (
      code TEXT PRIMARY KEY, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS participants (
      code TEXT NOT NULL REFERENCES conversations(code) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id), PRIMARY KEY(code, user_id)
    );
    CREATE TABLE IF NOT EXISTS answers (
      code TEXT NOT NULL REFERENCES conversations(code) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id), question INTEGER NOT NULL,
      body TEXT NOT NULL DEFAULT '', skipped INTEGER NOT NULL DEFAULT 0,
      submitted INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(code, user_id, question)
    );
    CREATE TABLE IF NOT EXISTS rate_limits (
      key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires_at INTEGER NOT NULL
    );
  `);
  db.prepare("INSERT OR IGNORE INTO topics (id, name, title, body, category, created_at, source) VALUES (?, ?, ?, '', 'lifestyle', ?, 1)").run(
    sourceTopicId, "Ben", "GitHub 3 周 2 万星的「高性价比人生指南」：600+条建议里，最值得做的是这些", "2026-10-04T03:15:18.656Z",
  );
  globalStore.howBetterDatabase = db;
  return db;
}

function transaction<T>(operation: (db: DatabaseSync) => T): T {
  const db = database();
  db.exec("BEGIN IMMEDIATE");
  try {
    const value = operation(db);
    db.exec("COMMIT");
    return value;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export class LocalServiceError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export function jsonResponse(data: unknown, status = 200, headers?: HeadersInit) {
  const response = Response.json(data, { status, headers });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export function serviceError(error: unknown) {
  if (error instanceof LocalServiceError) return jsonResponse({ error: error.message }, error.status);
  console.error("Local service failed:", error instanceof Error ? error.message : "Unknown error");
  return jsonResponse({ error: "本地服务暂时不可用，请重试。Local service unavailable." }, 500);
}

function requestOrigin(request: Request) {
  const target = new URL(request.url);
  // Next's internal request URL may use localhost even for a 127.0.0.1 or LAN
  // request. Host represents the address the browser actually used.
  const host = request.headers.get("host") || target.host;
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProtocol === "https" ? "https:" : target.protocol;
  return `${protocol}//${host}`;
}

export function verifyOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== requestOrigin(request)) {
    throw new LocalServiceError("请求来源不匹配。Please refresh this page and retry.", 403);
  }
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    throw new LocalServiceError("不接受跨站请求。Cross-site request rejected.", 403);
  }
}

export async function readBody(request: Request): Promise<Record<string, unknown>> {
  verifyOrigin(request);
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    throw new LocalServiceError("需要 JSON 请求。JSON body required.", 415);
  }
  const reader = request.body?.getReader();
  if (!reader) throw new LocalServiceError("缺少请求内容。Missing request body.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 1024 * 1024) {
      await reader.cancel();
      throw new LocalServiceError("内容过长。Request is too large.", 413);
    }
    chunks.push(value);
  }
  try {
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("object expected");
    return body as Record<string, unknown>;
  } catch {
    throw new LocalServiceError("请求内容格式不正确。Invalid JSON body.");
  }
}

export function requiredText(value: unknown, label: string, min: number, max: number) {
  if (typeof value !== "string" || value.trim().length < min || value.length > max) {
    throw new LocalServiceError(`${label}：请输入 ${min}–${max} 个字符。Enter ${min}–${max} characters.`);
  }
  return value.trim();
}

function digest(value: string) { return createHash("sha256").update(value).digest("hex"); }

function sessionToken(request: Request) {
  return request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1) || "";
}

export function getLocalUser(request: Request): LocalUser | null {
  const token = sessionToken(request);
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const user = database().prepare("SELECT u.id, u.name, u.email FROM users u JOIN sessions s ON s.user_id = u.id WHERE s.token_hash = ? AND s.expires_at > ?").get(digest(token), Date.now());
  return user ? user as LocalUser : null;
}

export function requireLocalUser(request: Request) {
  const user = getLocalUser(request);
  if (!user) throw new LocalServiceError("请先登录本地账号。Please sign in to your local account.", 401);
  return user;
}

function cookie(request: Request, token: string, seconds: number) {
  const secure = requestOrigin(request).startsWith("https:") ? "; Secure" : "";
  return `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${secure}`;
}

function rateLimit(key: string, maximum: number, windowMs = 15 * 60 * 1000) {
  const current = Date.now();
  const count = transaction((db) => {
    db.prepare("DELETE FROM rate_limits WHERE expires_at < ?").run(current);
    db.prepare("INSERT INTO rate_limits (key, attempts, expires_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET attempts = attempts + 1").run(digest(key), current + windowMs);
    return Number(db.prepare("SELECT attempts FROM rate_limits WHERE key = ?").get(digest(key))?.attempts);
  });
  if (count > maximum) throw new LocalServiceError("尝试过于频繁，请稍后再试。Too many attempts; please try again later.", 429);
}

export function authenticate(request: Request, input: Record<string, unknown>) {
  const action = input.action;
  if (action === "logout") {
    database().prepare("DELETE FROM sessions WHERE token_hash = ?").run(digest(sessionToken(request)));
    return jsonResponse({ user: null }, 200, { "Set-Cookie": cookie(request, "", 0) });
  }
  if (action !== "register" && action !== "login") throw new LocalServiceError("未知的账号操作。Unknown account action.");
  const email = requiredText(input.email, "邮箱 / Email", 3, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new LocalServiceError("邮箱格式不正确。Invalid email address.");
  requiredText(input.password, "密码 / Password", 8, 128);
  const password = input.password as string;
  rateLimit(`auth:${email}`, 12);
  const db = database();
  let account: Account | undefined;
  if (action === "register") {
    const name = requiredText(input.name, "昵称 / Name", 1, 40);
    const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    rateLimit(`register:${address}`, 20, 60 * 60 * 1000);
    if (db.prepare("SELECT id FROM users WHERE email = ?").get(email)) {
      throw new LocalServiceError("此邮箱已注册本地账号，请直接登录。A local account already exists; please sign in.", 409);
    }
    const salt = randomBytes(16).toString("hex");
    const hash = scryptSync(password, salt, 64).toString("hex");
    account = { id: randomUUID(), email, name, password: `${salt}:${hash}` };
    db.prepare("INSERT INTO users (id, email, name, password, created_at) VALUES (?, ?, ?, ?, ?)").run(account.id, email, name, account.password, new Date().toISOString());
  } else {
    account = db.prepare("SELECT id, email, name, password FROM users WHERE email = ?").get(email) as Account | undefined;
    const [salt, expected] = (account?.password || `${"0".repeat(32)}:${"0".repeat(128)}`).split(":");
    const actual = scryptSync(password, salt, 64);
    if (!account || !timingSafeEqual(actual, Buffer.from(expected, "hex"))) {
      throw new LocalServiceError("邮箱或密码不正确。Incorrect email or password.", 401);
    }
  }
  db.prepare("DELETE FROM rate_limits WHERE key = ?").run(digest(`auth:${email}`));
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
  const token = randomBytes(32).toString("base64url");
  db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(digest(token), account.id, Date.now() + sessionSeconds * 1000);
  return jsonResponse({ user: { id: account.id, name: account.name, email: account.email } }, 200, { "Set-Cookie": cookie(request, token, sessionSeconds) });
}

function validateProgress(value: unknown): LocalProgress {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length > 1500) {
    throw new LocalServiceError("清单格式不正确。Invalid progress data.");
  }
  const result: LocalProgress = {};
  for (const [id, item] of Object.entries(value)) {
    if (!/^\d{2}-\d{2}$/.test(id) || !item || typeof item !== "object" || Array.isArray(item)) {
      throw new LocalServiceError("清单条目不正确。Invalid checklist item.");
    }
    const entry = item as Record<string, unknown>;
    const clean: ProgressEntry = {};
    if (entry.status !== undefined) {
      if (!["done", "todo", "ignored"].includes(String(entry.status))) throw new LocalServiceError("未知进度。Invalid status.");
      clean.status = entry.status as ProgressEntry["status"];
    }
    if (entry.favorite !== undefined) {
      if (typeof entry.favorite !== "boolean") throw new LocalServiceError("收藏格式不正确。Invalid favorite.");
      clean.favorite = entry.favorite;
    }
    if (entry.note !== undefined) {
      if (typeof entry.note !== "string" || entry.note.length > 5000) throw new LocalServiceError("笔记最多 5000 字。Note is too long.");
      clean.note = entry.note;
    }
    result[id] = clean;
  }
  return result;
}

export function readProgress(user: LocalUser) {
  const row = database().prepare("SELECT data, updated_at FROM progress WHERE user_id = ?").get(user.id);
  return { progress: row ? JSON.parse(String(row.data)) as LocalProgress : {}, updatedAt: row?.updated_at || null };
}

export function updateProgress(user: LocalUser, input: Record<string, unknown>) {
  const updates = validateProgress(input.updates || {});
  const deleted = input.deleted || [];
  if (!Array.isArray(deleted) || deleted.length > 1500 || deleted.some((id) => typeof id !== "string" || !/^\d{2}-\d{2}$/.test(id))) {
    throw new LocalServiceError("清单格式不正确。Invalid checklist data.");
  }
  return transaction((db) => {
    const progress = readProgress(user).progress;
    Object.assign(progress, updates);
    for (const id of deleted as string[]) delete progress[id];
    const updatedAt = new Date().toISOString();
    db.prepare("INSERT INTO progress (user_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at").run(user.id, JSON.stringify(progress), updatedAt);
    return { progress, updatedAt };
  });
}

function requireTopic(id: unknown) {
  const topicId = requiredText(id, "主题 / Topic", 1, 80);
  const topic = database().prepare("SELECT * FROM topics WHERE id = ?").get(topicId);
  if (!topic) throw new LocalServiceError("主题不存在。Topic not found.", 404);
  return topic;
}

export function readForum(request: Request) {
  const params = new URL(request.url).searchParams;
  const id = params.get("id");
  const db = database();
  if (id) {
    const topic = requireTopic(id);
    const replies = db.prepare("SELECT id, name, body, created_at FROM replies WHERE topic_id = ? ORDER BY created_at ASC").all(id);
    const thanks = Number(db.prepare("SELECT COUNT(*) AS count FROM thanks WHERE topic_id = ?").get(id)?.count || 0);
    const user = getLocalUser(request);
    const thanked = user ? !!db.prepare("SELECT 1 FROM thanks WHERE topic_id = ? AND user_id = ?").get(id, user.id) : false;
    return { topic, replies, thanks, thanked };
  }
  const category = params.get("node");
  const topics = db.prepare(`SELECT t.*, (SELECT COUNT(*) FROM replies r WHERE r.topic_id = t.id) AS reply_count FROM topics t WHERE source = 0 ${category ? "AND category = ?" : ""} ORDER BY created_at DESC LIMIT 100`).all(...(category ? [category] : []));
  return { topics };
}

export function updateForum(user: LocalUser, input: Record<string, unknown>) {
  rateLimit(`forum:${user.id}`, 80, 60 * 60 * 1000);
  const db = database();
  if (input.action === "create") {
    const title = requiredText(input.title, "标题 / Title", 3, 150);
    const body = requiredText(input.body, "正文 / Body", 5, 20000);
    const category = typeof input.category === "string" ? input.category : "";
    if (!(forumCategories as readonly string[]).includes(category)) throw new LocalServiceError("请选择分类。Please select a category.");
    const id = randomUUID();
    db.prepare("INSERT INTO topics (id, user_id, name, title, body, category, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(id, user.id, user.name, title, body, category, new Date().toISOString());
    return { id };
  }
  const topic = requireTopic(input.id);
  const id = String(topic.id);
  if (input.action === "reply") {
    const body = requiredText(input.body, "回复 / Reply", 1, 10000);
    db.prepare("INSERT INTO replies (id, topic_id, user_id, name, body, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(randomUUID(), id, user.id, user.name, body, new Date().toISOString());
    return { ok: true };
  }
  if (input.action === "thanks") {
    return transaction((connection) => {
      const exists = connection.prepare("SELECT 1 FROM thanks WHERE topic_id = ? AND user_id = ?").get(id, user.id);
      if (exists) connection.prepare("DELETE FROM thanks WHERE topic_id = ? AND user_id = ?").run(id, user.id);
      else connection.prepare("INSERT INTO thanks (topic_id, user_id) VALUES (?, ?)").run(id, user.id);
      return { thanked: !exists };
    });
  }
  if (input.action === "report") {
    const reason = requiredText(input.reason, "原因 / Reason", 3, 1000);
    db.prepare("INSERT INTO reports (id, topic_id, user_id, reason, created_at) VALUES (?, ?, ?, ?, ?)").run(randomUUID(), id, user.id, reason, new Date().toISOString());
    return { ok: true, localOnly: true };
  }
  throw new LocalServiceError("未知的论坛操作。Unknown forum action.");
}

function conversationCode(input: unknown) {
  if (typeof input !== "string" || !/^[A-Za-z0-9_-]{32}$/.test(input)) throw new LocalServiceError("邀请链接不正确。Invalid invitation.");
  return input;
}

export function readConversation(user: LocalUser, codeInput?: string | null) {
  const db = database();
  if (!codeInput) {
    return { conversations: db.prepare("SELECT c.code, c.created_at, (SELECT COUNT(*) FROM answers a WHERE a.code = c.code AND a.user_id = ? AND submitted = 1) AS answered FROM conversations c JOIN participants p ON p.code = c.code WHERE p.user_id = ? ORDER BY c.created_at DESC LIMIT 50").all(user.id, user.id) };
  }
  const code = conversationCode(codeInput);
  if (!db.prepare("SELECT 1 FROM conversations WHERE code = ?").get(code)) throw new LocalServiceError("交流已删除或链接无效。Conversation not found.", 404);
  if (!db.prepare("SELECT 1 FROM participants WHERE code = ? AND user_id = ?").get(code, user.id)) return { code, invitation: true };
  const people = db.prepare("SELECT u.id, u.name FROM participants p JOIN users u ON u.id = p.user_id WHERE p.code = ?").all(code) as Array<SqlRow>;
  const rows = db.prepare("SELECT user_id, question, body, skipped, submitted FROM answers WHERE code = ?").all(code) as Array<SqlRow>;
  const mine = rows.filter((row) => row.user_id === user.id);
  const questions = Array.from({ length: 36 }, (_, question) => {
    const own = mine.find((row) => row.question === question);
    const others = own?.submitted ? rows.filter((row) => row.question === question && row.user_id !== user.id && row.submitted).map((row) => ({ name: people.find((person) => person.id === row.user_id)?.name || "", text: row.body, skipped: !!row.skipped })) : [];
    return { text: own?.body || "", skipped: !!own?.skipped, submitted: !!own?.submitted, others };
  });
  return { code, participants: people.map((person) => ({ name: person.name, me: person.id === user.id })), questions };
}

export function updateConversation(user: LocalUser, input: Record<string, unknown>) {
  rateLimit(`conversation:${user.id}`, 300, 60 * 60 * 1000);
  if (input.action === "create") {
    const code = randomBytes(24).toString("base64url");
    transaction((db) => {
      db.prepare("INSERT INTO conversations (code, created_at) VALUES (?, ?)").run(code, new Date().toISOString());
      db.prepare("INSERT INTO participants (code, user_id) VALUES (?, ?)").run(code, user.id);
    });
    return { code };
  }
  const code = conversationCode(input.code);
  return transaction((db) => {
    if (!db.prepare("SELECT 1 FROM conversations WHERE code = ?").get(code)) throw new LocalServiceError("交流不存在或已删除。Conversation not found.", 404);
    const member = !!db.prepare("SELECT 1 FROM participants WHERE code = ? AND user_id = ?").get(code, user.id);
    if (input.action === "join") {
      if (!member) {
        if (Number(db.prepare("SELECT COUNT(*) AS count FROM participants WHERE code = ?").get(code)?.count) >= 2) {
          throw new LocalServiceError("这次交流已有两人参与。This conversation already has two participants.", 409);
        }
        db.prepare("INSERT INTO participants (code, user_id) VALUES (?, ?)").run(code, user.id);
      }
      return { code };
    }
    if (!member) throw new LocalServiceError("你尚未加入这次交流。Please join this conversation first.", 403);
    if (input.action === "delete") {
      db.prepare("DELETE FROM conversations WHERE code = ?").run(code);
      return { deleted: true };
    }
    if (input.action === "save" || input.action === "submit") {
      const question = input.question;
      if (typeof question !== "number" || !Number.isInteger(question) || question < 0 || question > 35) throw new LocalServiceError("题号不正确。Invalid question.");
      if (db.prepare("SELECT 1 FROM answers WHERE code = ? AND user_id = ? AND question = ? AND submitted = 1").get(code, user.id, question)) {
        throw new LocalServiceError("已提交的答案不能修改。Submitted answers cannot be changed.", 409);
      }
      const skipped = input.skipped === true;
      const body = skipped ? "" : requiredText(input.text, "答案 / Answer", input.action === "submit" ? 1 : 0, 5000);
      db.prepare("INSERT INTO answers (code, user_id, question, body, skipped, submitted) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(code, user_id, question) DO UPDATE SET body = excluded.body, skipped = excluded.skipped, submitted = excluded.submitted").run(code, user.id, question, body, skipped ? 1 : 0, input.action === "submit" ? 1 : 0);
      return { saved: true };
    }
    throw new LocalServiceError("未知的交流操作。Unknown conversation action.");
  });
}
