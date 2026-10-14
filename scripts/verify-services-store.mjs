/** Validate authorization and persistence in a disposable database, without a server. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import ts from "typescript";

const directory = path.resolve(`.data/service-verification-${Date.now()}`);
process.env.HOW_LOCAL_DATA_DIR = directory;
const source = fs.readFileSync("src/lib/local-store.ts", "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
const store = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
const request = (cookie = "", body = {}, origin = "http://localhost:3000") => new Request("http://localhost:3000/api/local/auth", {
  method: "POST", headers: { "content-type": "application/json", origin, cookie }, body: JSON.stringify(body),
});
const register = async (email, name) => {
  const req = request("", { action: "register", email, name, password: "LocalVerification123!" });
  const response = store.authenticate(req, await store.readBody(req));
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie"), /HttpOnly; SameSite=Lax/);
  return { user: result.user, cookie: response.headers.get("set-cookie").split(";")[0] };
};

try {
  const alice = await register("alice@example.test", "Alice");
  const bob = await register("bob@example.test", "Bob");
  const charlie = await register("charlie@example.test", "Charlie");
  assert.equal(store.requireLocalUser(request(alice.cookie)).id, alice.user.id);
  assert.throws(() => store.authenticate(request(), { action: "login", email: "alice@example.test", password: "WrongPassword" }), (error) => error.status === 401);
  await assert.rejects(() => store.readBody(request(alice.cookie, {}, "https://outside.example")), (error) => error.status === 403);
  await assert.rejects(() => store.readBody(new Request("http://localhost:3000/api/local/auth", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })), (error) => error.status === 403);
  store.verifyOrigin(new Request("http://localhost:3000/api/local/auth", { headers: { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" } }));
  assert.throws(() => store.verifyOrigin(new Request("http://localhost:3000/api/local/auth", { headers: { host: "127.0.0.1:3000", origin: "http://attacker.example:3000" } })), (error) => error.status === 403);
  const db = globalThis.howBetterDatabase;
  assert(!db.prepare("SELECT password FROM users WHERE id = ?").get(alice.user.id).password.includes("LocalVerification"));
  assert(!db.prepare("SELECT token_hash FROM sessions WHERE user_id = ?").get(alice.user.id).token_hash.includes(alice.cookie.split("=")[1]));

  store.updateProgress(alice.user, { updates: { "01-01": { status: "done", favorite: true, note: "A real note" } } });
  assert.equal(store.readProgress(alice.user).progress["01-01"].note, "A real note");
  assert.deepEqual(store.readProgress(bob.user).progress, {});
  store.updateProgress(alice.user, { updates: { "02-03": { status: "todo" } } });
  assert.equal(store.readProgress(alice.user).progress["01-01"].status, "done");
  store.updateProgress(alice.user, { deleted: ["01-01"] });
  assert.equal(store.readProgress(alice.user).progress["01-01"], undefined);
  assert.throws(() => store.updateProgress(alice.user, { updates: { "01-01": { status: "injected" } } }), (error) => error.status === 400);
  assert.throws(() => store.updateProgress(alice.user, { updates: JSON.parse('{"__proto__":{"note":"injected"}}') }), (error) => error.status === 400);

  const topic = store.updateForum(alice.user, { action: "create", title: "A local test topic", body: "A test experience <script>alert(1)</script>", category: "practice" });
  store.updateForum(bob.user, { action: "reply", id: topic.id, body: "A local reply" });
  const forumRequest = new Request(`http://localhost:3000/api/local/forum?id=${topic.id}`);
  assert.equal(store.readForum(forumRequest).replies[0].name, "Bob");
  store.updateForum(bob.user, { action: "thanks", id: topic.id });
  assert.equal(store.readForum(forumRequest).thanks, 1);
  store.updateForum(bob.user, { action: "thanks", id: topic.id });
  assert.equal(store.readForum(forumRequest).thanks, 0);
  assert.equal(store.updateForum(bob.user, { action: "report", id: topic.id, reason: "Local report test" }).localOnly, true);

  const conversation = store.updateConversation(alice.user, { action: "create" });
  assert.equal(store.readConversation(bob.user, conversation.code).invitation, true);
  store.updateConversation(bob.user, { action: "join", code: conversation.code });
  assert.throws(() => store.updateConversation(charlie.user, { action: "join", code: conversation.code }), (error) => error.status === 409);
  store.updateConversation(alice.user, { action: "save", code: conversation.code, question: 0, text: "Private draft" });
  assert.deepEqual(store.readConversation(bob.user, conversation.code).questions[0].others, []);
  store.updateConversation(alice.user, { action: "submit", code: conversation.code, question: 0, text: "Alice submitted" });
  assert.deepEqual(store.readConversation(bob.user, conversation.code).questions[0].others, []);
  store.updateConversation(bob.user, { action: "submit", code: conversation.code, question: 0, text: "Bob submitted" });
  assert.equal(store.readConversation(alice.user, conversation.code).questions[0].others[0].text, "Bob submitted");
  assert.equal(store.readConversation(bob.user, conversation.code).questions[0].others[0].text, "Alice submitted");
  assert.throws(() => store.updateConversation(alice.user, { action: "save", code: conversation.code, question: 0, text: "Changed after reveal" }), (error) => error.status === 409);
  store.updateConversation(bob.user, { action: "delete", code: conversation.code });
  assert.throws(() => store.readConversation(alice.user, conversation.code), (error) => error.status === 404);
  store.authenticate(request(alice.cookie), { action: "logout" });
  assert.equal(store.getLocalUser(request(alice.cookie)), null);
  console.log("PASS: auth, hashed passwords/tokens, CSRF, per-account progress, validation, forum post/reply/thanks/report, two-person capacity, private drafts, gated reveal, immutable submissions, deletion and logout.");
} finally {
  globalThis.howBetterDatabase?.close();
  if (path.dirname(directory) !== path.resolve(".data") || !path.basename(directory).startsWith("service-verification-")) throw new Error("Unsafe cleanup target");
  fs.rmSync(directory, { recursive: true, force: true });
}
