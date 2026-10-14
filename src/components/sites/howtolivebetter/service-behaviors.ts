import { isStaticPreview, sitePath } from "@/lib/site-path";

type User = { id: string; email: string; name: string };
type Entry = { status?: "done" | "todo" | "ignored"; favorite?: boolean; note?: string };
type Progress = Record<string, Entry>;
type Topic = { id: string; name: string; title: string; body: string; category: string; created_at: string; source: number; reply_count: number };
type Reply = { id: string; name: string; body: string; created_at: string };
type Thread = { topic: Topic; replies: Reply[]; thanks: number; thanked: boolean };
type Answer = { text: string; skipped: boolean; submitted: boolean; others: Array<{ name: string; text: string; skipped: boolean }> };
type Conversation = { code: string; invitation?: boolean; participants?: Array<{ name: string; me: boolean }>; questions?: Answer[] };

const progressKey = "how-better-progress";
const ownerKey = "how-better-progress-owner";
const pendingKey = "how-better-progress-pending";
const categoryIds = ["lifestyle", "tools", "practice", "ask", "feedback"];
const serviceStyles = `
.local-service-note{color:#647664;font-size:13px;line-height:1.7;margin:14px 0}
.local-service-status{font-size:13px;line-height:1.6;min-height:1.6em;margin:12px 0;color:#2b6548}
.local-service-status[data-error=true]{color:#a4372b}
.local-service-form{display:grid;gap:16px;margin:24px 0 18px}
.local-service-form label{display:grid;gap:8px;font-size:14px;font-weight:600;color:#244532}
.local-service-form input,.local-service-form select,.local-service-form textarea,.local-service-invite{width:100%;max-width:100%;border:1px solid #cbd9c9;background:#fffef9;color:#1b3b2a;border-radius:10px;padding:12px;font:inherit}
.local-service-form input{min-height:46px}
.local-service-form textarea{min-height:140px;resize:vertical;font-weight:400;line-height:1.7}
.local-service-form input:focus,.local-service-form textarea:focus,.local-service-form select:focus{outline:2px solid #518264;outline-offset:2px}
.local-service-actions{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin:16px 0}
.local-service-link{color:#32634a;font-size:14px;cursor:pointer;text-decoration:underline;text-underline-offset:4px}
.local-service-badge{font-size:11px;border:1px solid #d5e1cd;border-radius:6px;padding:2px 6px;color:#547146;white-space:nowrap}
.local-service-body{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.9;margin:20px 0}
.local-service-reply{padding:20px 0;border-bottom:1px solid #e0e6d8;list-style:none}
.local-service-questions{display:flex;flex-wrap:wrap;gap:6px;margin:20px 0}
.local-service-questions button{width:34px;height:34px;border:1px solid #d8e2cf;border-radius:8px;color:#36553d;background:#fffef9;cursor:pointer}
.local-service-questions button[aria-current=true]{background:#245345;color:#fff}
.local-service-questions button[data-done=true]{border-color:#498457;font-weight:700}
.local-service-original{display:block;text-align:center;margin-top:18px;font-size:13px;color:#376c4c;text-decoration:underline;text-underline-offset:4px}
.local-service-gateway{display:flex;flex-direction:column;gap:18px;width:calc(100% - 32px);max-width:480px;min-height:0;margin:48px auto;padding:28px;background:var(--card,#fffef9);color:var(--card-foreground,#244532);border:1px solid #d5e1cd;border-radius:16px;line-height:1.7}
.local-service-gateway h1{font-size:24px;font-weight:700}
`;

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function link(text: string, href: string, className = "local-service-link") {
  const node = element("a", className, text);
  node.href = sitePath(href);
  return node;
}

function button(text: string, className = "life-button dark") {
  const node = element("button", className, text);
  node.type = "button";
  return node;
}

function navigate(destination: string) {
  // Each captured document owns its styles and DOM state, so use a normal link.
  link("", destination).click();
}

function field(name: string, caption: string, type = "text", required = true) {
  const label = element("label", "", caption);
  const input = element("input");
  input.type = type;
  input.name = name;
  input.required = required;
  label.append(input);
  return { label, input };
}

function readLocalProgress(): Progress {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(progressKey) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value as Progress : {};
  } catch { return {}; }
}

/** Adds local services to the captured semantic page, without source scripts or remote writes. */
export function installServiceBehaviors(root: HTMLElement, route: string): () => void {
  const controller = new AbortController();
  const { signal } = controller;
  const match = route.match(/^\/(en|es|ja|ru|vi)(?=\/|$)/);
  const locale = match?.[1] || "zh";
  const prefix = match ? `/${locale}` : "";
  const path = route.slice(prefix.length) || "/";
  const chinese = locale === "zh";
  const words = (zh: string, en: string) => chinese ? zh : en;
  let user: User | null = null;
  let pending: Record<string, Entry | null> = {};
  let previousQueue: { owner?: string; updates?: Record<string, Entry | null> } | null = null;
  try { previousQueue = JSON.parse(localStorage.getItem(pendingKey) || "null"); }
  catch { /* An invalid saved queue must not stop a local page. */ }
  let lastObserved = readLocalProgress();
  let synchronizing = false;
  let syncInFlight: Promise<unknown> | undefined;
  let applyingRemote = false;
  let readyToSync = false;
  let syncTimeout: ReturnType<typeof setTimeout> | undefined;
  let polling: ReturnType<typeof setInterval> | undefined;
  let currentQuestion = 0;
  let currentConversation: Conversation | undefined;
  let conversationRequest = 0;
  let draftDirty = false;
  const styles = element("style");
  styles.dataset.localServiceStyle = "true";
  styles.textContent = serviceStyles;
  root.append(styles);

  async function api<T>(endpoint: string, data?: unknown, method = "POST"): Promise<T> {
    if (isStaticPreview) {
      if (endpoint === "auth" && data === undefined) return { user: null } as T;
      throw new Error(words("这是前端预览，登录与在线提交暂不可用。阅读标记仍可保存在此浏览器。", "This is a frontend preview. Sign-in and online submissions are unavailable; reading progress is saved in this browser."));
    }
    const response = await fetch(sitePath(`/api/local/${endpoint}`), {
      method: data === undefined ? "GET" : method,
      credentials: "same-origin", cache: "no-store", signal,
      headers: data === undefined ? undefined : { "Content-Type": "application/json" },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || words("操作失败，请重试。", "Request failed. Please retry."));
    return result as T;
  }

  function status(parent: Element) {
    const node = element("p", "local-service-status");
    node.setAttribute("role", "status");
    parent.append(node);
    return node;
  }

  async function attempt(target: HTMLElement, action: () => Promise<void>, control?: HTMLButtonElement) {
    target.dataset.error = "false";
    target.textContent = words("正在处理…", "Working…");
    if (control) control.disabled = true;
    try { await action(); }
    catch (error) {
      if (signal.aborted) return;
      target.textContent = error instanceof Error ? error.message : words("操作失败，请重试。", "Please try again.");
      target.dataset.error = "true";
    } finally { if (control && control.isConnected) control.disabled = false; }
  }

  function originalLink(text: string, targetPath: string) {
    const anchor = link(text, `https://howtolivebetter.net${targetPath}`, "local-service-original");
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    return anchor;
  }

  function signInUrl(callback = `${location.pathname}${location.search}${location.hash}`) {
    return `${prefix}/sign-in?callbackUrl=${encodeURIComponent(callback)}`;
  }

  function nextLocation() {
    const callback = new URLSearchParams(location.search).get("callbackUrl");
    if (!callback) return `${prefix}/dashboard`;
    try {
      const url = new URL(callback, location.origin);
      if (url.origin !== location.origin || url.pathname.endsWith("/sign-in")) return `${prefix}/dashboard`;
      if (/\/lab\/new$/.test(url.pathname)) return `${prefix}/lab?compose=1`;
      return `${url.pathname}${url.search}${url.hash}`;
    } catch { return `${prefix}/dashboard`; }
  }

  function persistPending() {
    try { localStorage.setItem(pendingKey, JSON.stringify({ owner: user?.id || localStorage.getItem(ownerKey), updates: pending })); }
    catch { /* Browser storage may be unavailable; the in-memory queue remains usable. */ }
  }

  function syncLabel(text: string, error = false) {
    root.querySelectorAll<HTMLElement>(".life-sync-state").forEach((node) => {
      node.classList.remove("loading");
      node.textContent = text;
      node.title = words("数据保存在运行这个项目的服务器，与原站账号独立。", "Saved on this project's server, separate from the original website.");
      node.dataset.error = String(error);
    });
  }

  async function flushProgress() {
    if (synchronizing && syncInFlight) {
      await syncInFlight;
      return flushProgress();
    }
    if (!user || !readyToSync || synchronizing || !Object.keys(pending).length) return;
    synchronizing = true;
    const sent = { ...pending };
    const updates: Progress = {};
    const deleted: string[] = [];
    for (const [id, entry] of Object.entries(sent)) {
      if (entry === null) deleted.push(id); else updates[id] = entry;
    }
    syncLabel(words("正在同步到本地服务器…", "Syncing to this server…"));
    try {
      syncInFlight = api("progress", { updates, deleted }, "PUT");
      await syncInFlight;
      for (const [id, entry] of Object.entries(sent)) {
        if (JSON.stringify(pending[id]) === JSON.stringify(entry)) delete pending[id];
      }
      persistPending();
      syncLabel(words("已同步到本地服务器", "Saved to this server"));
    } catch (error) {
      syncLabel(words("同步失败，清单仍保存在此设备", "Sync failed; progress remains on this device"), true);
      throw error;
    } finally { synchronizing = false; syncInFlight = undefined; }
    if (Object.keys(pending).length) syncTimeout = setTimeout(() => { void flushProgress().catch(() => {}); }, 300);
  }

  function observeProgress() {
    const next = readLocalProgress();
    if (!applyingRemote) {
      for (const id of new Set([...Object.keys(lastObserved), ...Object.keys(next)])) {
        if (!/^\d{2}-\d{2}$/.test(id)) continue;
        if (JSON.stringify(lastObserved[id]) !== JSON.stringify(next[id])) pending[id] = next[id] || null;
      }
      persistPending();
      if (syncTimeout) clearTimeout(syncTimeout);
      syncTimeout = setTimeout(() => { void flushProgress().catch(() => {}); }, 600);
    }
    lastObserved = next;
  }

  async function initializeProgress() {
    if (!user) {
      syncLabel(words("保存在此设备 · 登录可同步", "Saved on this device · Sign in to sync"));
      return;
    }
    const owner = localStorage.getItem(ownerKey);
    if (previousQueue?.owner === user.id) pending = { ...previousQueue.updates, ...pending };
    if (!owner) pending = { ...readLocalProgress(), ...pending };
    if (owner && owner !== user.id) pending = {};
    const remote = await api<{ progress: Progress }>("progress");
    const combined = { ...remote.progress };
    for (const [id, entry] of Object.entries(pending)) {
      if (entry === null) delete combined[id]; else combined[id] = entry;
    }
    applyingRemote = true;
    try {
      localStorage.setItem(progressKey, JSON.stringify(combined));
      localStorage.setItem(ownerKey, user.id);
      lastObserved = combined;
      window.dispatchEvent(new Event("how-progress"));
    } finally { applyingRemote = false; }
    readyToSync = true;
    persistPending();
    syncLabel(words("已同步到本地服务器", "Saved to this server"));
    await flushProgress();
  }

  function updateHeader() {
    if (!user) return;
    root.querySelectorAll<HTMLAnchorElement>('header a[href*="sign-in"]').forEach((anchor) => {
      anchor.textContent = user!.name;
      anchor.href = sitePath(`${prefix}/sign-in`);
      anchor.title = words("本地账号管理", "Local account");
    });
  }

  function renderAuth(register = false) {
    const panel = root.querySelector<HTMLElement>(".life-auth-panel") || (path === "/sign-up" ? root.querySelector<HTMLElement>('[data-slot="card"]') : null);
    if (!panel) return;
    panel.classList.add("life-auth-panel");
    panel.replaceChildren();
    const heading = element("div", "life-auth-panel-heading");
    const h2 = element("h2", "", user ? words("你的本地账号", "Your local account") : register ? words("创建本地账号", "Create a local account") : words("登录本地账号", "Sign in locally"));
    h2.id = "life-auth-panel-title";
    heading.append(element("span", "life-eyebrow", "LOCAL ACCOUNT"), h2,
      element("p", "", words("账号仅用于这个项目，与原站账号独立。无需邮箱验证码，请使用独立密码。", "This account belongs to this project, separate from the original site. No email verification; use a separate password.")));
    panel.append(heading);
    if (isStaticPreview) {
      panel.append(element("p", "local-service-note", words("前端界面预览：可以查看表单，登录与注册不会发送请求。", "Frontend preview: these forms do not send sign-in or registration requests.")));
    }
    if (user) {
      panel.append(element("p", "local-service-note", `${user.name} · ${user.email}`));
      const actions = element("div", "local-service-actions");
      const logout = button(words("退出登录", "Sign out"), "local-service-link");
      actions.append(link(words("打开我的清单", "Open my checklist"), `${prefix}/dashboard`, "life-button dark"), logout);
      panel.append(actions);
      const message = status(panel);
      logout.addEventListener("click", () => { void attempt(message, async () => {
        await flushProgress();
        await api("auth", { action: "logout" });
        localStorage.removeItem(ownerKey);
        localStorage.removeItem(pendingKey);
        localStorage.setItem(progressKey, "{}");
        navigate(`${prefix}/sign-in`);
      }, logout); }, { signal });
    } else {
      const form = element("form", "local-service-form life-auth-email-form");
      const name = field("name", words("昵称", "Name"));
      name.input.setAttribute("autocomplete", "nickname");
      name.input.maxLength = 40;
      const email = field("email", words("邮箱", "Email"), "email");
      email.input.autocomplete = "username";
      email.input.maxLength = 254;
      const password = field("password", words("密码（至少 8 位）", "Password (at least 8 characters)"), "password");
      password.input.autocomplete = register ? "new-password" : "current-password";
      password.input.minLength = 8;
      password.input.maxLength = 128;
      if (register) form.append(name.label);
      form.append(email.label, password.label);
      const submit = button(register ? words("注册并继续", "Create account") : words("登录并继续", "Sign in"), "life-auth-submit");
      submit.type = "submit";
      form.append(submit);
      panel.append(form);
      const message = status(panel);
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        void attempt(message, async () => {
          await api("auth", { action: register ? "register" : "login", name: name.input.value, email: email.input.value, password: password.input.value });
          navigate(nextLocation());
        }, submit);
      }, { signal });
      const switcher = button(register ? words("已有本地账号？登录", "Already have a local account? Sign in") : words("没有本地账号？免费注册", "New here? Create a local account"), "local-service-link");
      switcher.addEventListener("click", () => renderAuth(!register), { signal });
      panel.append(switcher);
    }
    panel.append(originalLink(words("微信登录 / 原站账号 → 前往原站", "WeChat / original account → Open original site"), `${prefix}/sign-in`),
      element("p", "life-auth-privacy", words("本地服务不发送验证邮件，也不会访问原站账号。下载授权请在原站完成。", "This local service does not send email or access original accounts. Complete download authorization on the original site.")));
  }

  function renderOriginalAccountNotice() {
    const notices: Record<string, [string, string, string, string]> = {
      "/forgot-password": ["找回密码", "Reset your password", "本地账号暂未接入密码找回。原站账号的密码找回请在原站完成。", "Password recovery is not configured for local accounts. Recover an original account on the original website."],
      "/reset-password": ["重置密码", "Reset your password", "本地账号暂未接入密码重置邮件。原站邮件中的重置链接需要在原站使用。", "Local password reset emails are not configured. Use original password reset links on the original website."],
      "/verify-email": ["邮箱验证", "Email verification", "本地账号无需邮件验证。原站发送的验证邮件请在原站完成验证。", "Local accounts do not require email verification. Verify original account emails on the original website."],
      "/wechat-login": ["微信公众号登录", "WeChat sign-in", "微信公众号登录由原站提供。你也可以使用本地账号保存当前项目中的清单。", "WeChat sign-in is provided by the original website. A local account can save your checklist on this server."],
      "/wechat-nickname": ["微信账号昵称", "WeChat account name", "微信账号与昵称由原站管理。本地账号可以在注册时设置昵称。", "WeChat accounts and names are managed by the original website. Choose a local name during registration."],
      "/auth-callback": ["登录回调", "Sign-in callback", "此页面不处理原站的登录回调。请使用本地账号登录，或返回原站继续。", "This page cannot process original sign-in callbacks. Sign in locally or continue on the original website."],
      "/redeem-invite": ["邀请码", "Invitation code", "原站邀请码需要在原站领取。本地阅读和生活工具可以直接使用。", "Redeem original invitation codes on the original website. Local reading and tools are available directly."],
    };
    const notice = notices[path];
    if (!notice) return;
    const host = root.querySelector<HTMLElement>('[data-slot="card"]') || root.firstElementChild;
    if (!(host instanceof HTMLElement)) return;
    host.className = "local-service-gateway";
    host.replaceChildren(
      element("h1", "", words(notice[0], notice[1])),
      element("p", "", words(notice[2], notice[3])),
      link(words("登录本地账号", "Sign in locally"), `${prefix}/sign-in`, "life-button dark"),
      link(words("返回阅读", "Back to reading"), `${prefix}/book`),
      originalLink(words("前往原站账号服务 ↗", "Open original account services ↗"), `${prefix}/sign-in`),
    );
  }

  function renderDownloads() {
    const actions = root.querySelector<HTMLElement>(".life-download-access-action");
    if (!actions) return;
    actions.replaceChildren();
    actions.append(element("p", "life-download-status", words("原站下载需要原站登录授权，本地账号不提供该授权。", "Downloads require authorization on the original website. A local account cannot grant that access.")),
      originalLink(words("前往原站选择格式并下载 ↗", "Choose a format and download on the original site ↗"), `${prefix}/book/download#download`));
  }

  function categoryName(id: string) {
    const names = chinese ? ["生活方式", "效率工具", "我的实践", "求助问答", "网站反馈"] : ["Lifestyle", "Tools", "My practice", "Questions", "Site feedback"];
    return names[categoryIds.indexOf(id)] || names[0];
  }

  function composeTopic(parent: HTMLElement) {
    parent.querySelector("[data-local-compose]")?.remove();
    const section = element("section", "lab-panel lab-compose");
    section.dataset.localCompose = "true";
    section.append(element("h2", "", words("发布本地主题", "Create a local topic")));
    if (!user) {
      section.append(link(words("登录后参与", "Sign in to participate"), signInUrl(`${prefix}/lab?compose=1`), "life-button dark"));
      parent.prepend(section);
      return;
    }
    const form = element("form", "local-service-form");
    const title = field("title", words("主题标题", "Topic title"));
    title.input.minLength = 3;
    title.input.maxLength = 150;
    const select = element("select");
    select.name = "category";
    const category = element("label", "", words("分类", "Category"));
    category.append(select);
    categoryIds.forEach((id) => {
      const option = element("option", "", categoryName(id));
      option.value = id;
      select.append(option);
    });
    const bodyLabel = element("label", "", words("分享你的具体经历", "Share your experience"));
    const body = element("textarea");
    body.name = "body";
    body.required = true;
    body.minLength = 5;
    body.maxLength = 20000;
    bodyLabel.append(body);
    const submit = button(words("发布到本地实验室", "Publish to local lab"));
    submit.type = "submit";
    form.append(title.label, category, bodyLabel, submit);
    section.append(form, element("p", "local-service-note", words("此内容将保存在当前服务器，不会发布到原站。", "This post is saved on this server and is not published to the original website.")));
    const message = status(section);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void attempt(message, async () => {
        const result = await api<{ id: string }>("forum", { action: "create", title: title.input.value, body: body.value, category: select.value });
        navigate(`${prefix}/lab?topic=${encodeURIComponent(result.id)}`);
      }, submit);
    }, { signal });
    parent.prepend(section);
    title.input.focus();
  }

  async function showThread(id: string, captured = false) {
    const data = await api<Thread>(`forum?id=${encodeURIComponent(id)}`);
    const main = root.querySelector<HTMLElement>("main.lab-page");
    if (!main || signal.aborted) return;
    if (!captured) {
      main.classList.add("lab-narrow");
      const article = element("article", "lab-panel lab-topic");
      article.append(link(categoryName(data.topic.category), `${prefix}/lab?node=${data.topic.category}`, "lab-node"),
        element("h1", "", data.topic.title), element("p", "lab-meta", `${data.topic.name} · ${new Date(data.topic.created_at).toLocaleString(locale)} · ${words("本地主题", "Local topic")}`),
        element("div", "local-service-body", data.topic.body));
      main.replaceChildren(link(words("← 返回实验室", "← Back to lab"), `${prefix}/lab`, "lab-back"), article,
        element("section", "lab-panel lab-replies"), element("section", "lab-panel lab-compose"));
    }
    const topic = main.querySelector<HTMLElement>(".lab-topic");
    if (!topic) return;
    if (!topic.querySelector("[data-local-source-note]")) {
      const note = element("p", "local-service-note", captured ? words("原站公开主题的本地快照。下方回复、感谢和举报仅保存在当前服务器。", "A local snapshot of a public original topic. Replies, thanks and reports below stay on this server.") : words("这是当前服务器上的本地主题。", "This is a local topic on this server."));
      note.dataset.localSourceNote = "true";
      topic.append(note);
    }
    const interactions = topic.querySelector(".lab-interactions") || element("div", "lab-interactions");
    interactions.replaceChildren();
    const thanks = button(`${data.thanked ? "✓ " : ""}${words("感谢", "Thanks")} · ${data.thanks}`, "local-service-link");
    const report = button(words("举报", "Report"), "local-service-link");
    const actions = element("div", "local-service-actions");
    actions.append(thanks, report);
    interactions.append(actions);
    const message = status(interactions);
    topic.append(interactions);
    thanks.addEventListener("click", () => {
      if (!user) { navigate(signInUrl()); return; }
      void attempt(message, async () => { await api("forum", { action: "thanks", id }); await showThread(id, true); }, thanks);
    }, { signal });
    report.addEventListener("click", () => {
      if (!user) { navigate(signInUrl()); return; }
      const reason = window.prompt(words("举报原因（仅记录在本地，不会发送给原站）：", "Reason (saved locally; not sent to the original site):"));
      if (!reason) return;
      void attempt(message, async () => {
        await api("forum", { action: "report", id, reason });
        message.textContent = words("举报已记录在本地服务器，尚未接入审核通知。", "Report saved on this server. Moderation notifications are not connected.");
      }, report);
    }, { signal });
    const replies = main.querySelector<HTMLElement>(".lab-replies");
    if (replies) {
      replies.replaceChildren(element("h2", "", words(`${data.replies.length} 条本地回复`, `${data.replies.length} local replies`)));
      const list = element("ol");
      data.replies.forEach((reply) => {
        const item = element("li", "local-service-reply");
        item.append(element("p", "lab-meta", `${reply.name} · ${new Date(reply.created_at).toLocaleString(locale)}`), element("div", "local-service-body", reply.body));
        list.append(item);
      });
      if (!data.replies.length) replies.append(element("p", "lab-empty", words("还没有本地回复，来分享你的经验吧。", "No local replies yet. Share your experience.")));
      replies.append(list);
    }
    const compose = main.querySelector<HTMLElement>(".lab-compose");
    if (!compose) return;
    compose.replaceChildren();
    if (!user) {
      compose.append(link(words("登录后参与", "Sign in to reply"), signInUrl(), "life-button dark"));
      return;
    }
    const form = element("form", "local-service-form");
    const label = element("label", "", words("分享你的经验", "Share your experience"));
    const input = element("textarea");
    input.name = "reply";
    input.required = true;
    input.maxLength = 10000;
    label.append(input);
    const submit = button(words("发布本地回复", "Post local reply"));
    submit.type = "submit";
    form.append(label, submit);
    compose.append(form);
    const replyStatus = status(compose);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void attempt(replyStatus, async () => {
        await api("forum", { action: "reply", id, body: input.value });
        await showThread(id, true);
      }, submit);
    }, { signal });
  }

  async function renderLab() {
    const main = root.querySelector<HTMLElement>("main.lab-page");
    if (!main) return;
    const params = new URLSearchParams(location.search);
    const capturedId = path.match(/^\/lab\/t\/([^/]+)$/)?.[1];
    const id = capturedId || params.get("topic");
    if (id) { await showThread(id, !!capturedId); return; }
    const category = params.get("node") || "";
    const { topics } = await api<{ topics: Topic[] }>(`forum${category ? `?node=${encodeURIComponent(category)}` : ""}`);
    if (signal.aborted) return;
    const sourceList = main.querySelector<HTMLElement>(".lab-panel > ul");
    sourceList?.querySelectorAll<HTMLElement>(".lab-topic-row").forEach((row) => { row.hidden = !!category && category !== "lifestyle"; });
    main.querySelectorAll<HTMLAnchorElement>(".lab-tabs a").forEach((anchor) => {
      const active = (new URL(anchor.href).searchParams.get("node") || "") === category;
      anchor.classList.toggle("active", active);
      if (active) anchor.setAttribute("aria-current", "page"); else anchor.removeAttribute("aria-current");
    });
    topics.reverse().forEach((topic) => {
      const row = element("li", "lab-topic-row");
      const copy = element("div", "lab-row-copy");
      copy.append(link(topic.title, `${prefix}/lab?topic=${encodeURIComponent(topic.id)}`, "lab-topic-title"),
        element("div", "lab-meta", `${categoryName(topic.category)} · ${topic.name} · ${words("本地", "Local")} · ${new Date(topic.created_at).toLocaleDateString(locale)}`));
      row.append(element("div", "lab-avatar", topic.name.slice(0, 1).toUpperCase()), copy, element("span", "lab-reply-count", String(topic.reply_count)));
      sourceList?.prepend(row);
    });
    const sidebar = main.querySelector(".lab-aside p");
    if (sidebar) sidebar.textContent = words("保留原站公开内容；本地新增主题和回复保存在当前服务器，不会发布到原站。", "Public source content is preserved. New local topics and replies stay on this server.");
    const create = main.querySelector<HTMLAnchorElement>(".lab-hero > a");
    if (create) {
      create.href = sitePath(`${prefix}/lab?compose=1`);
      create.addEventListener("click", (event) => {
        event.preventDefault();
        composeTopic(main);
        main.querySelector("[data-local-compose]")?.scrollIntoView({ block: "start", behavior: "smooth" });
      }, { signal });
    }
    if (params.get("compose") === "1") composeTopic(main);
  }

  function connectionNote() {
    return element("p", "local-service-note", words("本地两人交流：答案保存在当前项目服务器。每题提交后才可查看对方已提交的答案，提交后不可修改。邀请链接只发给对方；任一参与者都可删除整次交流。", "Local two-person conversation: answers stay on this project's server. Submit a question to reveal the other submitted answer; submissions cannot be changed. Share the invitation only with your partner. Either participant may delete the conversation."));
  }

  async function loadConversation(code: string, background = false) {
    const requestId = ++conversationRequest;
    const next = await api<Conversation>(`together?code=${encodeURIComponent(code)}`);
    // A delayed poll must never replace newer submitted data or an edited draft.
    if (signal.aborted || requestId !== conversationRequest || (background && draftDirty)) return;
    if (JSON.stringify(next) === JSON.stringify(currentConversation)) return;
    currentConversation = next;
    if (!signal.aborted) renderConversation();
  }

  function renderConversation() {
    const main = root.querySelector<HTMLElement>("main.connection-page");
    const session = currentConversation;
    if (!main || !session) return;
    const section = element("section", "connection-question");
    main.querySelectorAll(".connection-question, .local-service-questions, .connection-status, progress").forEach((node) => node.remove());
    section.append(connectionNote());
    if (session.invitation) {
      const join = button(words("加入这次两人交流", "Join this conversation"), "connection-primary");
      section.append(join);
      const message = status(section);
      join.addEventListener("click", () => { void attempt(message, async () => {
        await api("together", { action: "join", code: session.code });
        await loadConversation(session.code);
      }, join); }, { signal });
      main.append(section);
      return;
    }
    const answers = session.questions || [];
    const answer = answers[currentQuestion];
    if (!answer) return;
    const invite = `${location.origin}${prefix}/together?session=${encodeURIComponent(session.code)}`;
    const inviteInput = element("input", "local-service-invite");
    inviteInput.value = invite;
    inviteInput.readOnly = true;
    inviteInput.setAttribute("aria-label", words("两人交流邀请链接", "Conversation invitation"));
    inviteInput.addEventListener("click", () => inviteInput.select(), { signal });
    const inviteLabel = element("label", "connection-label", words("邀请另一人（需能访问当前服务器）", "Invite your partner (they need access to this server)"));
    inviteLabel.append(inviteInput);
    const copy = button(words("复制邀请链接", "Copy invitation"), "local-service-link");
    section.append(inviteLabel, copy);
    const message = status(section);
    copy.addEventListener("click", () => { void attempt(message, async () => {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(invite);
      else { inviteInput.select(); if (!document.execCommand("copy")) throw new Error(words("请选中上方链接后复制。", "Select and copy the link above.")); }
      message.textContent = words("邀请链接已复制", "Invitation copied");
    }, copy); }, { signal });
    section.append(element("p", "connection-status", words(`第 ${currentQuestion + 1} / 36 题 · 已提交 ${answers.filter((entry) => entry.submitted).length} 题 · ${session.participants?.length || 1} 人参与`, `Question ${currentQuestion + 1} / 36 · ${answers.filter((entry) => entry.submitted).length} submitted · ${session.participants?.length || 1} participants`)));
    section.append(element("p", "life-eyebrow", words(`第 ${Math.floor(currentQuestion / 12) + 1} 组`, `Set ${Math.floor(currentQuestion / 12) + 1}`)),
      element("h2", "", (connectionQuestions[locale] || connectionQuestions.zh)[currentQuestion]));
    if (answer.submitted) {
      const pair = element("div", "connection-pair");
      const own = element("div");
      own.append(element("h3", "", user?.name || words("我的答案", "My answer")), element("p", "connection-answer", answer.skipped ? words("已跳过", "Skipped") : answer.text));
      pair.append(own);
      answer.others.forEach((other) => {
        const card = element("div");
        card.append(element("h3", "", other.name), element("p", "connection-answer", other.skipped ? words("已跳过", "Skipped") : other.text));
        pair.append(card);
      });
      section.append(pair);
      if (!answer.others.length) section.append(element("p", "local-service-note", words("答案已提交，等待对方提交这一题。", "Answer submitted. Waiting for your partner to submit this question.")));
    } else {
      const form = element("form", "local-service-form");
      const label = element("label", "connection-label", words("你的答案", "Your answer"));
      const input = element("textarea");
      input.name = "answer";
      input.maxLength = 5000;
      input.value = answer.text;
      input.addEventListener("input", () => { draftDirty = true; }, { signal });
      label.append(input);
      const actions = element("div", "connection-actions local-service-actions");
      const submit = button(words("提交并揭晓", "Submit and reveal"), "connection-primary");
      submit.type = "submit";
      const save = button(words("保存草稿", "Save draft"), "local-service-link");
      const skip = button(words("跳过这题", "Skip this question"), "local-service-link");
      actions.append(submit, save, skip);
      form.append(label, actions);
      const formMessage = status(form);
      section.append(form);
      const saveAnswer = async (action: string, skipped = false) => {
        const controls = [input, submit, save, skip];
        controls.forEach((control) => { control.disabled = true; });
        try {
          await api("together", { action, code: session.code, question: currentQuestion, text: input.value, skipped });
          draftDirty = false;
          await loadConversation(session.code);
          if (action === "save") {
            const newStatus = main.querySelector<HTMLElement>(".local-service-form .local-service-status");
            if (newStatus) newStatus.textContent = words("草稿已保存在本地服务器", "Draft saved to this server");
          }
        } finally {
          controls.forEach((control) => { if (control.isConnected) control.disabled = false; });
        }
      };
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        void attempt(formMessage, () => saveAnswer("submit"), submit);
      }, { signal });
      save.addEventListener("click", () => { void attempt(formMessage, () => saveAnswer("save"), save); }, { signal });
      skip.addEventListener("click", () => { void attempt(formMessage, () => saveAnswer("submit", true), skip); }, { signal });
    }
    const questions = element("nav", "local-service-questions");
    questions.setAttribute("aria-label", words("选择题目", "Choose a question"));
    answers.forEach((entry, index) => {
      const select = button(String(index + 1), "");
      select.setAttribute("aria-current", String(index === currentQuestion));
      select.dataset.done = String(entry.submitted);
      select.addEventListener("click", () => {
        if (draftDirty && !window.confirm(words("当前草稿尚未保存，仍要切换吗？", "Your draft is not saved. Switch questions?"))) return;
        draftDirty = false;
        currentQuestion = index;
        renderConversation();
      }, { signal });
      questions.append(select);
    });
    const remove = button(words("删除整次交流", "Delete conversation"), "local-service-link");
    remove.addEventListener("click", () => {
      if (!window.confirm(words("删除后，双方所有答案和邀请链接将失效。确定删除？", "This deletes both participants' answers and the invitation. Delete?"))) return;
      void attempt(message, async () => {
        await api("together", { action: "delete", code: session.code });
        draftDirty = false;
        navigate(`${prefix}/together`);
      }, remove);
    }, { signal });
    section.append(questions, remove);
    main.append(section);
  }

  async function renderTogether() {
    const main = root.querySelector<HTMLElement>("main.connection-page");
    if (!main) return;
    const section = main.querySelector<HTMLElement>(".connection-question");
    if (!section) return;
    section.replaceChildren(connectionNote());
    if (!user) {
      section.append(link(words("登录并继续", "Sign in to continue"), signInUrl(), "connection-primary"));
      return;
    }
    const code = new URLSearchParams(location.search).get("session");
    if (code) {
      await loadConversation(code);
      polling = setInterval(() => {
        if (draftDirty || document.hidden) return;
        void loadConversation(code, true).catch((error: unknown) => {
          const target = root.querySelector<HTMLElement>(".connection-question .local-service-status");
          if (target && !signal.aborted) target.textContent = error instanceof Error ? error.message : "";
        });
      }, 7000);
      return;
    }
    const create = button(words("开始新的交流", "Start a conversation"), "connection-primary");
    section.append(create);
    const message = status(section);
    create.addEventListener("click", () => { void attempt(message, async () => {
      const result = await api<{ code: string }>("together", { action: "create" });
      navigate(`${prefix}/together?session=${encodeURIComponent(result.code)}`);
    }, create); }, { signal });
    const result = await api<{ conversations: Array<{ code: string; created_at: string; answered: number }> }>("together");
    const list = element("section", "connection-question");
    list.append(element("h2", "", words("我的交流", "My conversations")));
    result.conversations.forEach((session) => {
      const row = element("p");
      row.append(link(`${new Date(session.created_at).toLocaleString(locale)} · ${session.answered}/36`, `${prefix}/together?session=${encodeURIComponent(session.code)}`));
      list.append(row);
    });
    if (!result.conversations.length) list.append(element("p", "local-service-note", words("还没有交流，邀请一位朋友开始吧。", "No conversations yet. Invite a friend to begin.")));
    main.append(list);
  }

  window.addEventListener("how-progress", observeProgress, { signal });
  window.addEventListener("storage", (event) => {
    if (event.key === ownerKey && user && event.newValue !== user.id) {
      readyToSync = false;
      pending = {};
      location.reload();
      return;
    }
    if (event.key === progressKey && (!user || localStorage.getItem(ownerKey) === user.id)) window.dispatchEvent(new Event("how-progress"));
  }, { signal });
  window.addEventListener("online", () => { void flushProgress().catch(() => {}); }, { signal });
  window.addEventListener("beforeunload", (event) => { if (draftDirty) event.preventDefault(); }, { signal });
  renderDownloads();
  renderOriginalAccountNotice();
  void (async () => {
    try {
      const session = await api<{ user: User | null }>("auth");
      if (signal.aborted) return;
      user = session.user;
      updateHeader();
      if (path === "/sign-in" || path === "/sign-up") renderAuth(path === "/sign-up");
      await initializeProgress().catch(() => {
        syncLabel(words("清单同步暂不可用，此设备上的记录仍保留", "Sync is unavailable; your device's progress is retained"), true);
      });
      if (path === "/lab" || path.startsWith("/lab/t/")) await renderLab();
      if (path === "/lab/new") {
        const main = root.querySelector<HTMLElement>("main.lab-page");
        if (main) {
          main.replaceChildren(link(words("← 返回实验室", "← Back to the lab"), `${prefix}/lab`, "lab-back"));
          composeTopic(main);
        }
      }
      if (path === "/together") await renderTogether();
    } catch (error) {
      if (signal.aborted) return;
      const parent = root.querySelector<HTMLElement>(".life-auth-panel, .connection-question, .lab-page, .life-dashboard-toolbar");
      if (parent) {
        parent.querySelector(".life-auth-loading")?.remove();
        const message = status(parent);
        message.dataset.error = "true";
        message.textContent = error instanceof Error ? error.message : words("本地服务暂时不可用。", "Local service unavailable.");
      }
    }
  })();

  return () => {
    if (syncTimeout) clearTimeout(syncTimeout);
    if (polling) clearInterval(polling);
    controller.abort();
    styles.remove();
  };
}

// Original question text is extracted as data from the public locale resources.
// No downloaded application code is executed in this implementation.
const connectionQuestions: Record<string, string[]> = {
  "zh": [
    "最近哪件普通的小事，让你的一天轻松了一点？",
    "如果我们一起逛一条陌生的街，你通常会先注意什么？",
    "哪一种声音或气味会让你想起舒服的地方？",
    "你有什么不太起眼、却一直很喜欢的小习惯？",
    "如果一起安排一个不用花钱的周末，你希望把时间留给什么？",
    "你愿意教我一件自己熟悉的小事吗？你会选什么？",
    "最近有什么东西让你产生了好奇，想再了解一点？",
    "和新认识的人相处时，什么举动会让你放松？",
    "一天里哪一段时间最像你自己的时间？你会怎么用它？",
    "你喜欢怎样的临时邀约：提前计划，还是想到就出发？",
    "有什么普通的东西，你觉得比别人以为的更有趣？",
    "如果今天留下一张照片，你想记录什么，为什么？",
    "最近哪件事让你觉得有人在认真听你说话？",
    "你做过哪次小小的尝试，结果和预期不一样？",
    "有什么曾经不理解的选择，现在你更能理解了？",
    "你遇到难题时，通常先自己想，还是先找人聊？",
    "哪个地方让你觉得可以放下表现自己的压力？",
    "有人帮助过你的一件小事，为什么一直记得？",
    "你最近学会了怎样更好地照顾自己的精力？",
    "什么样的赞美会让你觉得被看见，而不是被评价？",
    "有什么你正在慢慢练习、还不想急着做好？",
    "当你说“我需要一点时间”时，希望别人怎样回应？",
    "你会用什么方式告诉朋友：我在乎这段关系？",
    "有什么经历改变了你对“过得好”的理解？愿意分享多少都可以。",
    "如果我们一起完成一件小事，你希望怎样分工？",
    "遇到意见不同时，你希望我先问你什么？",
    "你心情不好时，希望我倾听、陪着做点事，还是留一点空间？",
    "什么样的界限会让你在相处中更安心？",
    "对于回复消息的速度，你有什么舒服的期待？",
    "如果一方临时改变计划，怎样沟通会让你觉得被尊重？",
    "有什么话题你想慢慢聊，不希望第一次就说完？",
    "你希望我们保留什么共同的小仪式？",
    "如果我误解了你，怎样提醒会让你比较自在？",
    "你愿意和我分享一个接下来想尝试的小计划吗？",
    "聊到这里，你还想认真问我哪一个问题？",
    "接下来，如果双方都愿意，你想怎样继续这次交谈？"
  ],
  "en": [
    "What small, everyday thing made your day a little easier recently?",
    "If we explored an unfamiliar street together, what would you usually notice first?",
    "What sound or smell reminds you of a place where you feel comfortable?",
    "What small, unremarkable habit have you always enjoyed?",
    "If we planned a weekend together without spending money, what would you want us to make time for?",
    "Would you teach me one small thing you know well? What would you choose?",
    "What has caught your curiosity recently and made you want to learn more?",
    "When spending time with someone new, what helps you feel at ease?",
    "What part of the day feels most like your own time? How do you spend it?",
    "For an outing at short notice, do you prefer a little planning or heading out as soon as the idea comes up?",
    "What ordinary thing do you find more interesting than other people seem to?",
    "If you took one photo to remember today, what would you capture, and why?",
    "What happened recently that made you feel someone was really listening to you?",
    "What small experiment have you tried that turned out differently from what you expected?",
    "What choice did you once find hard to understand but understand better now?",
    "When you face a problem, do you usually think it through alone first or talk to someone?",
    "Where can you let go of the pressure to impress people?",
    "What small act of help from someone has stayed with you, and why?",
    "What have you recently learned about taking better care of your energy?",
    "What kind of compliment makes you feel seen rather than judged?",
    "What are you slowly practicing without wanting to rush to get it right?",
    "When you say “I need some time,” how would you like others to respond?",
    "How do you show a friend that their friendship matters to you?",
    "What experience changed your understanding of living well? Share as much or as little as you like.",
    "If we worked on a small task together, how would you like us to divide it up?",
    "When we disagree, what would you like me to ask you first?",
    "When you are feeling low, would you like me to listen, do something with you, or give you some space?",
    "What boundaries help you feel more secure when spending time with someone?",
    "What feels comfortable to you in terms of how quickly we reply to messages?",
    "If one of us changes plans at short notice, what way of communicating would help you feel respected?",
    "What topic would you like to explore slowly, without saying everything the first time?",
    "What small ritual would you like us to share?",
    "If I misunderstand you, how could you point it out in a way that feels comfortable?",
    "Would you share one small plan you would like to try soon?",
    "At this point in the conversation, what question would you still really like to ask me?",
    "If we both want to, how would you like to continue this conversation?"
  ],
  "es": [
    "¿Qué pequeña cosa cotidiana te ha hecho el día un poco más llevadero últimamente?",
    "Si recorriéramos juntos una calle desconocida, ¿en qué te fijarías primero?",
    "¿Qué sonido u olor te recuerda a un lugar donde te sientes a gusto?",
    "¿Qué pequeña costumbre poco llamativa te ha gustado siempre?",
    "Si organizáramos juntos un fin de semana sin gastar dinero, ¿a qué te gustaría dedicar el tiempo?",
    "¿Me enseñarías algo sencillo que conozcas bien? ¿Qué elegirías?",
    "¿Qué te ha despertado curiosidad últimamente y te gustaría conocer mejor?",
    "Cuando estás con alguien que acabas de conocer, ¿qué gesto te ayuda a relajarte?",
    "¿Qué momento del día sientes más tuyo? ¿Cómo lo aprovechas?",
    "¿Cómo prefieres las invitaciones para quedar: con algo de planificación o salir en cuanto surge la idea?",
    "¿Qué cosa cotidiana te parece más interesante de lo que otros creen?",
    "Si hoy hicieras una foto para recordar algo, ¿qué guardarías y por qué?",
    "¿Qué te ha hecho sentir últimamente que alguien te escuchaba de verdad?",
    "¿Qué pequeña cosa probaste y salió de forma distinta a lo que esperabas?",
    "¿Qué decisión que antes no entendías comprendes mejor ahora?",
    "Cuando tienes un problema, ¿sueles pensarlo primero a solas o hablar con alguien?",
    "¿En qué lugar sientes que puedes dejar de esforzarte por causar una buena impresión?",
    "¿Qué pequeña ayuda que recibiste recuerdas todavía, y por qué?",
    "¿Qué has aprendido últimamente para cuidar mejor tu energía?",
    "¿Qué tipo de cumplido te hace sentir que te ven tal como eres, en lugar de juzgarte?",
    "¿Qué estás practicando poco a poco, sin querer exigirte hacerlo bien enseguida?",
    "Cuando dices «Necesito un poco de tiempo», ¿cómo te gustaría que te respondieran?",
    "¿Cómo le haces saber a un amigo que esa relación te importa?",
    "¿Qué experiencia cambió tu idea de vivir bien? Comparte solo lo que quieras.",
    "Si hiciéramos juntos una pequeña tarea, ¿cómo te gustaría repartirla?",
    "Cuando no estemos de acuerdo, ¿qué te gustaría que te preguntara primero?",
    "Cuando estás de mal humor, ¿prefieres que te escuche, que hagamos algo juntos o que te deje un poco de espacio?",
    "¿Qué límites te ayudan a sentir más tranquilidad en una relación?",
    "¿Qué expectativas sobre el tiempo para responder mensajes te hacen sentir a gusto?",
    "Si uno cambia un plan a última hora, ¿cómo debería comunicarlo para que te sintieras respetado?",
    "¿Qué tema te gustaría conversar poco a poco, sin contarlo todo la primera vez?",
    "¿Qué pequeño ritual compartido te gustaría que mantuviéramos?",
    "Si te entiendo mal, ¿cómo te resultaría más cómodo hacérmelo saber?",
    "¿Compartirías conmigo un pequeño plan que te gustaría probar próximamente?",
    "Después de hablar hasta aquí, ¿qué pregunta te gustaría hacerme con atención?",
    "Si ambos queremos, ¿cómo te gustaría continuar esta conversación?"
  ],
  "ja": [
    "最近、何気ない小さな出来事で、一日が少し楽になったことは？",
    "二人で知らない通りを歩いたら、まず何に目が向くと思う？",
    "心地よい場所を思い出す音や香りはある？",
    "目立たないけれど、ずっと気に入っている小さな習慣は？",
    "お金を使わない週末を一緒に過ごすなら、何に時間を使いたい？",
    "自分がよく知っているちょっとしたことを、一つ教えてくれるなら何を選ぶ？",
    "最近、気になってもっと知りたいと思ったものは？",
    "初めて会った人と過ごすとき、どんな振る舞いがあると気楽になる？",
    "一日のうち、自分だけの時間だと感じるのはいつ？ その時間をどう使う？",
    "急なお誘いはどう楽しみたい？ 予定を立ててから？ それとも思いついたら出発？",
    "ありふれているけれど、人が思う以上に面白いと感じるものは？",
    "今日の写真を一枚残すなら、何を撮りたい？ それはなぜ？",
    "最近、誰かが自分の話をきちんと聞いてくれていると感じた出来事は？",
    "ちょっと試してみたことで、結果が予想と違ったことは？",
    "以前は理解できなかったけれど、今ならもっと理解できる選択はある？",
    "難しい問題に出会ったら、まず自分で考える？ それとも誰かと話す？",
    "自分をよく見せようとするプレッシャーから離れられる場所は？",
    "誰かに助けてもらった小さな出来事で、今も覚えているものは？ なぜ覚えている？",
    "最近、自分の気力や体力を大切にするために覚えたことは？",
    "どんなふうに褒められると、評価されるよりも、自分を見てもらえたと感じる？",
    "今、少しずつ練習していて、急いで上手にならなくてもいいと思うことは？",
    "「少し時間が欲しい」と言ったら、相手にどう応じてほしい？",
    "友達に「この関係を大切に思っている」と、どう伝える？",
    "「よく生きる」ということへの考えが変わった経験はある？ 話したい範囲だけで大丈夫。",
    "二人で小さなことを一つやり遂げるなら、どう役割を分けたい？",
    "意見が違うとき、私にまず何を聞いてほしい？",
    "気分が沈んでいるとき、話を聞いてほしい？ 一緒に何かをしたい？ それとも少し距離を置いてほしい？",
    "付き合う中で安心できるように、どんな境界線を大切にしたい？",
    "メッセージの返信は、どれくらいの速さだと心地よい？",
    "どちらかが急に予定を変えるとき、どう伝えると大切にされていると感じる？",
    "少しずつ話したい、最初の一回では話しきりたくない話題は？",
    "二人で続けたい、小さな恒例の習慣は？",
    "私があなたを誤解したら、どんなふうに知らせるのが気楽？",
    "これから試してみたい小さな計画を、一つ教えてくれる？",
    "ここまで話して、私にじっくり聞いてみたい質問は？",
    "この先、二人とも続けたいと思うなら、この会話をどう続けたい？"
  ],
  "ru": [
    "Какая недавняя повседневная мелочь сделала твой день немного легче?",
    "Если бы мы вместе гуляли по незнакомой улице, на что ты обычно обратил бы внимание в первую очередь?",
    "Какой звук или запах напоминает тебе о месте, где тебе хорошо?",
    "Какая у тебя есть неприметная привычка, которая давно тебе нравится?",
    "Если бы мы провели вместе выходные, не тратя денег, чему тебе хотелось бы уделить время?",
    "Хочешь научить меня какой-нибудь небольшой вещи, которую хорошо знаешь? Что бы ты выбрал?",
    "Что недавно вызвало у тебя любопытство и желание узнать больше?",
    "Какие поступки помогают тебе расслабиться рядом с новым знакомым?",
    "Какая часть дня больше всего ощущается как твоё собственное время? Как ты его проводишь?",
    "Как тебе приятнее договариваться о внезапной прогулке: немного всё спланировать или сразу отправиться, как только появилась идея?",
    "Какую обычную вещь ты считаешь интереснее, чем думают другие?",
    "Если бы ты сохранил одну фотографию сегодняшнего дня, что бы на ней было и почему?",
    "Какое недавнее событие дало тебе почувствовать, что тебя внимательно слушают?",
    "Какая небольшая попытка сделать что-то новое дала результат, которого ты не ожидал?",
    "Какой выбор ты раньше не понимал, а теперь понимаешь лучше?",
    "Столкнувшись с трудностью, ты обычно сначала обдумываешь её сам или обсуждаешь с кем-то?",
    "В каком месте ты можешь перестать стараться произвести впечатление?",
    "Какую небольшую помощь другого человека ты до сих пор помнишь и почему?",
    "Чему ты недавно научился, чтобы лучше беречь свои силы?",
    "Какой комплимент даёт тебе почувствовать, что тебя замечают, а не оценивают?",
    "В чём ты понемногу практикуешься, не торопясь добиться хорошего результата?",
    "Когда ты говоришь «Мне нужно немного времени», какой реакции ты ждёшь от других?",
    "Как ты показываешь другу, что ваши отношения важны для тебя?",
    "Какой опыт изменил твоё понимание хорошей жизни? Расскажи столько, сколько хочется.",
    "Если бы мы вместе делали небольшое дело, как тебе хотелось бы распределить задачи?",
    "Когда наши мнения расходятся, о чём мне лучше сначала спросить тебя?",
    "Когда у тебя плохое настроение, тебе хочется, чтобы я выслушал тебя, чем-то занялся вместе с тобой или дал тебе немного пространства?",
    "Какие границы помогают тебе чувствовать себя спокойнее в общении?",
    "Какой темп ответов на сообщения для тебя комфортен?",
    "Если кто-то из нас в последний момент меняет планы, как лучше сообщить об этом, чтобы ты чувствовал уважение к себе?",
    "Какую тему тебе хочется обсуждать постепенно, не рассказывая всё при первом разговоре?",
    "Какой небольшой общий ритуал тебе хотелось бы сохранить?",
    "Если я неправильно тебя пойму, как тебе было бы удобнее мне об этом сказать?",
    "Хочешь поделиться небольшим планом, который тебе хотелось бы попробовать в ближайшее время?",
    "Теперь, когда мы столько обсудили, какой вопрос тебе ещё хочется всерьёз задать мне?",
    "Если мы оба захотим, как тебе хотелось бы продолжить эту беседу?"
  ],
  "vi": [
    "Gần đây, việc nhỏ bình thường nào khiến một ngày của bạn nhẹ nhàng hơn một chút?",
    "Nếu cùng đi dạo trên một con phố lạ, bạn thường sẽ chú ý điều gì trước?",
    "Âm thanh hoặc mùi hương nào khiến bạn nhớ đến một nơi dễ chịu?",
    "Bạn có thói quen nhỏ nào không mấy nổi bật nhưng vẫn luôn yêu thích?",
    "Nếu cùng lên kế hoạch cho một cuối tuần không tốn tiền, bạn muốn dành thời gian cho điều gì?",
    "Bạn có muốn dạy tôi một việc nhỏ mà bạn thành thạo không? Bạn sẽ chọn việc gì?",
    "Gần đây, điều gì khiến bạn tò mò và muốn tìm hiểu thêm?",
    "Khi ở bên một người mới quen, hành động nào giúp bạn thả lỏng?",
    "Khoảng thời gian nào trong ngày khiến bạn cảm thấy đó là thời gian của riêng mình nhất? Bạn dùng nó thế nào?",
    "Bạn thích lời rủ đi chơi theo cách nào: có kế hoạch trước hay nghĩ ra là đi?",
    "Có thứ gì bình thường mà bạn thấy thú vị hơn mọi người thường nghĩ?",
    "Nếu lưu lại một bức ảnh hôm nay, bạn muốn ghi lại điều gì và vì sao?",
    "Gần đây, việc gì khiến bạn cảm thấy có người đang thật sự lắng nghe mình?",
    "Bạn từng thử một việc nhỏ nào mà kết quả khác với dự đoán?",
    "Có lựa chọn nào trước đây bạn không hiểu nhưng giờ đã hiểu hơn?",
    "Khi gặp vấn đề khó, bạn thường tự suy nghĩ trước hay tìm người trò chuyện trước?",
    "Nơi nào giúp bạn cảm thấy có thể bỏ xuống áp lực phải thể hiện bản thân?",
    "Có người từng giúp bạn một việc nhỏ nào mà bạn vẫn nhớ? Vì sao?",
    "Gần đây, bạn đã học được cách chăm sóc năng lượng của mình tốt hơn như thế nào?",
    "Lời khen thế nào khiến bạn cảm thấy được nhìn nhận, thay vì bị đánh giá?",
    "Bạn đang từ từ luyện tập điều gì mà chưa muốn vội làm thật tốt?",
    "Khi nói “Tôi cần một chút thời gian”, bạn mong người khác đáp lại thế nào?",
    "Bạn dùng cách nào để nói với một người bạn rằng mối quan hệ này quan trọng với mình?",
    "Trải nghiệm nào đã thay đổi cách bạn hiểu về “sống tốt”? Bạn muốn chia sẻ bao nhiêu cũng được.",
    "Nếu cùng hoàn thành một việc nhỏ, bạn muốn phân chia công việc thế nào?",
    "Khi bất đồng ý kiến, bạn muốn tôi hỏi điều gì trước?",
    "Khi tâm trạng không tốt, bạn muốn tôi lắng nghe, cùng làm gì đó hay để bạn có chút không gian riêng?",
    "Những ranh giới nào giúp bạn yên tâm hơn khi ở bên người khác?",
    "Về tốc độ trả lời tin nhắn, bạn mong đợi thế nào để cảm thấy thoải mái?",
    "Nếu một người đổi kế hoạch vào phút cuối, cách trao đổi thế nào sẽ khiến bạn cảm thấy được tôn trọng?",
    "Có chủ đề nào bạn muốn trò chuyện từ từ, không muốn kể hết ngay lần đầu?",
    "Bạn muốn chúng ta duy trì thói quen nhỏ chung nào?",
    "Nếu tôi hiểu lầm bạn, bạn thấy thoải mái hơn khi nhắc tôi bằng cách nào?",
    "Bạn có muốn chia sẻ với tôi một kế hoạch nhỏ mà bạn sắp thử không?",
    "Trò chuyện đến đây, bạn còn muốn hỏi tôi câu nào một cách nghiêm túc?",
    "Tiếp theo, nếu cả hai đều muốn, bạn muốn tiếp tục cuộc trò chuyện này thế nào?"
  ]
};
