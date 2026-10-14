import {
  bingoIds, chapterImages, checkupBaseWeights, checkupCopy, checkupDefinitions,
  dailyTasks, layoffCopy, quizQuestions, toolMessages, type ToolLocale,
} from "./tool-data";
import { loadTips, localePath, readProgress, routeLocale, updateProgress, type Tip } from "./reader-data";
import QRCode from "qrcode";
import { sitePath } from "@/lib/site-path";

type Cleanup = () => void;
type Child = Node | string | null | undefined;

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", ...children: Child[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.append(...children.filter((child): child is Node | string => child !== null && child !== undefined));
  return node;
}

function button(text: string, action: string, className = "life-button"): HTMLButtonElement {
  const node = element("button", className, text);
  node.type = "button";
  node.dataset.toolAction = action;
  return node;
}

function link(text: string, href: string, className = "life-text-link"): HTMLAnchorElement {
  const node = element("a", className, text);
  node.href = sitePath(href);
  return node;
}

function readStored<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || "null") as T ?? fallback; } catch { return fallback; }
}

function saveStored(key: string, value: unknown): boolean {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

function dateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function shiftedDate(day: string, count: number): string {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() + count);
  return dateKey(date);
}

function shuffle<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = link("", url);
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

class ToolScope {
  readonly cleaners: Cleanup[] = [];
  alive = true;
  constructor(readonly main: HTMLElement, readonly locale: ToolLocale) {}
  text(key: string, values: Record<string, string | number> = {}): string {
    const value = toolMessages[this.locale][key] ?? toolMessages.zh[key] ?? key;
    return value.replace(/\{(\w+)\}/g, (whole, name: string) => String(values[name] ?? whole));
  }
  on(target: EventTarget, event: string, callback: EventListener): void {
    target.addEventListener(event, callback);
    this.cleaners.push(() => target.removeEventListener(event, callback));
  }
  own<T extends HTMLElement>(node: T, parent: HTMLElement = this.main): T {
    parent.append(node);
    this.cleaners.push(() => node.remove());
    return node;
  }
  hide(node: HTMLElement): void {
    const hidden = node.hidden;
    node.hidden = true;
    this.cleaners.push(() => { node.hidden = hidden; });
  }
  action(callback: (action: string, target: HTMLElement, event: Event) => void): void {
    this.on(this.main, "click", (event) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-tool-action]") : null;
      if (target && this.main.contains(target)) {
        event.preventDefault();
        callback(target.dataset.toolAction || "", target, event);
      }
    });
  }
  notice(text: string, parent: HTMLElement = this.main): void {
    let message = parent.querySelector<HTMLElement>(":scope > [data-tool-status]");
    if (!message) {
      message = this.own(element("p", "practice-storage-note"), parent);
      message.dataset.toolStatus = "true";
      message.setAttribute("role", "status");
    }
    message.textContent = text;
  }
  cleanup(): void { this.alive = false; this.cleaners.reverse().forEach((clean) => clean()); }
}

async function showShare(scope: ToolScope, title: string, lines: string[], url: string): Promise<void> {
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const dialog = element("dialog", "social-share-dialog");
  const close = button("×", "", "practice-icon-button");
  close.setAttribute("aria-label", scope.text("life_share_close"));
  dialog.append(element("header", "practice-section-header", element("h2", "", title), close));
  dialog.append(element("p", "", lines.slice(0, 2).join(" · ")));
  const input = element("textarea");
  input.value = `${title}\n${lines.join("\n")}\n${url}`;
  input.rows = 5;
  input.setAttribute("aria-label", scope.text("life_share_caption"));
  const copy = button(scope.text("life_share_copylink1"), "", "life-button dark");
  const imageButton = button(scope.text("life_quiz_download"), "");
  const status = element("p", "practice-storage-note");
  status.setAttribute("role", "status");
  dialog.append(input, element("div", "quiz-actions", copy, imageButton), status);
  scope.own(dialog, document.body);
  const finish = () => { dialog.close(); dialog.remove(); previous?.focus(); };
  close.addEventListener("click", finish);
  dialog.addEventListener("click", (event) => { if (event.target === dialog) finish(); });
  dialog.addEventListener("close", () => previous?.focus());
  copy.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(url); status.textContent = scope.text("life_share_copied"); }
    catch { input.focus(); input.select(); status.textContent = scope.text("life_share_copyfailed1"); }
  });
  imageButton.addEventListener("click", async () => {
    imageButton.disabled = true;
    try {
      await document.fonts.ready;
      const canvas = element("canvas");
      canvas.width = 1080;
      const bingoCard = lines.length === 9 && lines.every((line) => /^[✓○]/.test(line));
      canvas.height = bingoCard ? 1440 : 430 + lines.length * 115;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas unavailable");
      context.fillStyle = "#f6f1e7";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "#244b39";
      context.font = "700 50px sans-serif";
      const wrap = (text: string, x: number, y: number, width: number, height: number) => {
        let line = "";
        for (const character of text) {
          if (context.measureText(line + character).width > width && line) { context.fillText(line, x, y); y += height; line = character; }
          else line += character;
        }
        context.fillText(line, x, y);
        return y + height;
      };
      let y = wrap(title, 75, 105, 930, 66) + 35;
      context.font = "28px sans-serif";
      if (bingoCard) {
        lines.forEach((line, index) => {
          const x = 60 + index % 3 * 326, top = 210 + Math.floor(index / 3) * 300;
          const done = line.startsWith("✓");
          context.fillStyle = done ? "#dce8d7" : "#fffdf6";
          context.fillRect(x, top, 308, 280);
          context.strokeStyle = "#d8d8c8"; context.lineWidth = 2; context.strokeRect(x, top, 308, 280);
          context.fillStyle = "#244b39"; context.font = "24px sans-serif";
          context.fillText(`${String(index + 1).padStart(2, "0")} ${done ? "✓" : ""}`, x + 22, top + 40);
          let size = 26;
          const countLines = () => {
            let count = 1, current = "";
            for (const character of line.slice(2)) {
              if (context.measureText(current + character).width > 264) { count++; current = character; }
              else current += character;
            }
            return count;
          };
          context.font = `${size}px sans-serif`;
          while (countLines() * (size + 9) > 180 && size > 16) { size -= 2; context.font = `${size}px sans-serif`; }
          wrap(line.slice(2), x + 22, top + 89, 264, size + 9);
        });
      } else {
        for (const line of lines) y = wrap(line, 75, y, 930, 42) + 25;
      }
      context.fillStyle = "#52705d";
      context.font = "24px sans-serif";
      const qr = element("canvas");
      await QRCode.toCanvas(qr, url, { width: 190, margin: 1, color: { dark: "#244b39", light: "#f6f1e7" } });
      context.drawImage(qr, 815, canvas.height - 220, 190, 190);
      context.fillText("HowToLiveBetter", 75, canvas.height - 125);
      context.font = "19px sans-serif";
      wrap(url, 75, canvas.height - 80, 700, 26);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (blob) download(blob, "howtolivebetter-share.png");
    } catch { status.textContent = scope.text("life_quiz_carderror1"); }
    imageButton.disabled = false;
  });
  dialog.showModal();
  close.focus();
}

interface DailyRecord { day: string; taskId: string; completed: boolean }

function installDaily(scope: ToolScope): void {
  const { main } = scope;
  const storageKey = "how-better-daily";
  const stored = readStored<DailyRecord[]>(storageKey, []);
  let records = Array.isArray(stored) ? stored.filter((item) => typeof item?.day === "string" && dailyTasks.some((task) => task.id === item.taskId)) : [];
  const copy = main.querySelector<HTMLElement>(".daily-task-copy");
  const actions = main.querySelector<HTMLElement>(".daily-actions");
  if (!copy || !actions) return;
  const originalActions = [...actions.children] as HTMLElement[];
  originalActions.forEach((node) => scope.hide(node));
  copy.querySelectorAll<HTMLElement>('p[role="status"]').forEach((node) => scope.hide(node));
  const runtimeActions = scope.own(element("span", "daily-actions"), actions);
  const shareRow = scope.own(element("div", "daily-share-row"), copy);
  const history = main.querySelector<HTMLElement>(".daily-history");
  const historyData = history ? scope.own(element("div"), history) : null;
  if (history && historyData) history.querySelector(".daily-sync")?.before(historyData);
  const today = () => records.find((record) => record.day === dateKey());
  function render(): void {
    const record = today();
    const task = dailyTasks.find((item) => item.id === record?.taskId);
    main.querySelector(".daily-task-card")?.classList.toggle("is-done", !!record?.completed);
    const heading = copy!.querySelector("h2");
    const description = copy!.querySelector('[aria-live="polite"] p');
    if (heading) heading.textContent = scope.text(task ? `life_daily_task_${task.id}_title` : "life_daily_emptytitle1");
    if (description) description.textContent = scope.text(task ? `life_daily_task_${task.id}_body` : "life_daily_emptybody1");
    const meta = copy!.querySelector(".daily-meta");
    meta?.replaceChildren(element("span", "", dateKey()), ...(task ? [element("span", "", scope.text("life_daily_minutes", { count: task.minutes }))] : []));
    const image = main.querySelector<HTMLImageElement>(".daily-art img");
    if (image && chapterImages[task?.chapter || "22"]) image.src = sitePath(chapterImages[task?.chapter || "22"]);
    runtimeActions.replaceChildren();
    shareRow.replaceChildren();
    if (task) {
      const complete = button(scope.text(record?.completed ? "life_daily_done" : "life_daily_complete"), "daily-complete", "life-button dark");
      complete.disabled = !!record?.completed;
      runtimeActions.append(complete);
      if (!record?.completed) runtimeActions.append(button(scope.text("life_daily_again"), "daily-draw", "daily-secondary"));
      shareRow.append(button(scope.text("life_daily_share"), "daily-share", "daily-text-button"));
      if (record?.completed) shareRow.append(button(scope.text("life_daily_undo"), "daily-undo", "daily-text-button"));
      shareRow.append(link(scope.text("life_daily_related"), localePath(scope.locale, `/book/${task.chapter}`), "daily-related"));
    } else runtimeActions.append(button(scope.text("life_daily_draw"), "daily-draw", "life-button dark"));
    if (!historyData) return;
    const completed = new Set(records.filter((item) => item.completed).map((item) => item.day));
    let streak = 0, cursor = completed.has(dateKey()) ? dateKey() : shiftedDate(dateKey(), -1);
    while (completed.has(cursor)) { streak++; cursor = shiftedDate(cursor, -1); }
    const stats = element("div", "daily-stats");
    for (const [key, value] of [["life_daily_days", completed.size], ["life_daily_streak", streak], ["life_daily_month", [...completed].filter((day) => day.startsWith(dateKey().slice(0, 7))).length]] as const) {
      stats.append(element("div", "", element("strong", "", String(value)), element("span", "", scope.text(key))));
    }
    const heat = element("div", "daily-heat");
    const dayDetail = element("p", "daily-day-detail", scope.text("life_daily_chooseday1"));
    dayDetail.setAttribute("aria-live", "polite");
    for (let offset = -364; offset <= 0; offset++) {
      const day = shiftedDate(dateKey(), offset), done = completed.has(day);
      const cell = button("", `daily-day:${day}`, done ? "checked" : "");
      cell.title = `${day} · ${scope.text(done ? "life_daily_checked" : "life_daily_unchecked")}`;
      cell.setAttribute("aria-label", cell.title);
      heat.append(cell);
    }
    const scroll = element("div", "daily-heat-scroll", heat);
    historyData.replaceChildren(stats, scroll, dayDetail);
    scroll.scrollLeft = scroll.scrollWidth;
  }
  scope.action((action) => {
    const record = today();
    if (action === "daily-draw") {
      if (record?.completed) return;
      const shared = new URLSearchParams(location.search).get("task");
      const task = !record && dailyTasks.some((item) => item.id === shared) ? shared! : shuffle(dailyTasks.filter((item) => item.id !== record?.taskId))[0].id;
      records = [...records.filter((item) => item.day !== dateKey()), { day: dateKey(), taskId: task, completed: false }];
    } else if (action === "daily-complete" || action === "daily-undo") {
      if (record) record.completed = action === "daily-complete";
    } else if (action === "daily-share" && record) {
      void showShare(scope, scope.text(`life_daily_task_${record.taskId}_title`), [scope.text(`life_daily_task_${record.taskId}_body`)], `${location.origin}${localePath(scope.locale, "/daily")}?task=${record.taskId}`);
      return;
    } else if (action.startsWith("daily-day:")) {
      const day = action.slice(10), item = records.find((record) => record.day === day);
      const detail = historyData?.querySelector(".daily-day-detail");
      if (detail) detail.textContent = `${day} · ${item?.completed ? scope.text(`life_daily_task_${item.taskId}_title`) : scope.text("life_daily_unchecked")}`;
      return;
    } else return;
    if (!saveStored(storageKey, records)) scope.notice(scope.text("practice_storageunavailable1"), copy!);
    render();
  });
  const rank = main.querySelector<HTMLElement>('.daily-rank-grid [role="status"]');
  if (rank) rank.textContent = scope.locale === "zh" ? "排行榜需要原站账号服务。此处的任务和打卡记录保存在当前浏览器。" : "Rankings require the original account service. Your tasks and check-ins are saved in this browser.";
  const sync = main.querySelector<HTMLButtonElement>(".daily-sync button");
  if (sync) scope.on(sync, "click", () => { location.href = localePath(scope.locale, "/sign-in?callbackUrl=/daily"); });
  render();
  scope.on(window, "focus", render);
}

function validBoard(value: unknown): string[] | null {
  if (typeof value !== "string" || !/^v1\.(\d{2}-\d{2}\.){8}\d{2}-\d{2}$/.test(value)) return null;
  const ids = value.slice(3).split(".");
  return new Set(ids).size === 9 && ids.every((id) => bingoIds.includes(id)) ? ids : null;
}

async function installBingo(scope: ToolScope, shared: boolean): Promise<void> {
  const { main } = scope;
  const tips = await loadTips(scope.locale);
  if (!scope.alive) return;
  const tipMap = new Map(tips.map((tip) => [tip.id, tip]));
  const params = new URLSearchParams(location.search);
  const suppliedBoard = validBoard(params.get("board"));
  if (shared && !suppliedBoard) return;
  if (shared) {
    [...main.children].forEach((node) => { if (node instanceof HTMLElement) scope.hide(node); });
    main.classList.remove("bingo-invalid");
    scope.cleaners.push(() => main.classList.add("bingo-invalid"));
    scope.own(element("header", "bingo-hero", element("div", "", element("h1", "", scope.text("life_bingo_sharetitle1")), element("p", "", scope.text("life_bingo_sharelead1")))));
  }
  let ids = suppliedBoard || validBoard(readStored("how-better-bingo", "")) || bingoIds.slice(0, 9);
  const doneParameter = params.get("done");
  const sharedDone = /^d[01]{9}$/.test(doneParameter || "") ? [...doneParameter!.slice(1)].map((value) => value === "1") : Array<boolean>(9).fill(false);
  let grid = main.querySelector<HTMLElement>(".bingo-grid");
  if (!grid) {
    const paper = scope.own(element("section", "bingo-paper", element("div", "bingo-paper-heading", scope.text("life_bingo_sharetitle1"))));
    grid = element("div", "bingo-grid");
    paper.append(grid);
  }
  const originalGrid = grid;
  scope.hide(originalGrid);
  const runtimeGrid = scope.own(element("div", "bingo-grid"), originalGrid.parentElement!);
  originalGrid.after(runtimeGrid);
  const controls = [...main.querySelectorAll<HTMLButtonElement>(".bingo-controls > button")];
  controls.forEach((node, index) => { node.disabled = false; node.dataset.toolAction = ["bingo-shuffle", "bingo-add", "bingo-share"][index]; });
  const doneValues = () => shared ? sharedDone : ids.map((id) => readProgress()[id]?.status === "done");
  function render(): void {
    const done = doneValues();
    runtimeGrid.replaceChildren(...ids.map((id, index) => {
      const tip = tipMap.get(id);
      const title = tip?.title || id;
      const tile = element("article", `bingo-tile${done[index] ? " is-done" : ""}`);
      const mark = button("", `bingo-toggle:${index}`, "bingo-tile-main");
      mark.disabled = shared;
      mark.setAttribute("aria-pressed", String(done[index]));
      mark.setAttribute("aria-label", `${scope.text(done[index] ? "life_bingo_done" : "life_bingo_mark")}: ${title}`);
      mark.append(element("span", "bingo-tile-top", element("span", "", String(index + 1).padStart(2, "0")), element("span", "bingo-check", done[index] ? "✓" : "")), element("h2", "", title), element("span", "bingo-tile-status", scope.text(done[index] ? "life_bingo_done" : "life_bingo_mark")));
      const actions = element("div", "bingo-tile-actions", link(scope.text("life_bingo_source"), localePath(scope.locale, `/book/${id.slice(0, 2)}#${id}`), ""));
      if (!shared) actions.append(button(scope.text("life_bingo_replace"), `bingo-replace:${index}`, ""));
      tile.append(mark, actions);
      return tile;
    }));
    const count = done.filter(Boolean).length;
    const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]].filter((line) => line.every((index) => done[index])).length;
    const heading = main.querySelector(".bingo-paper-heading [aria-live]");
    if (heading) heading.textContent = scope.text("life_bingo_count", { count });
    const footer = main.querySelector(".bingo-paper-footer strong");
    if (footer) footer.textContent = scope.text("life_bingo_lines", { count: lines });
    if (!shared) saveStored("how-better-bingo", `v1.${ids.join(".")}`);
  }
  scope.action((action) => {
    if (action.startsWith("bingo-toggle:") && !shared) {
      const id = ids[Number(action.split(":")[1])];
      updateProgress(id, { status: readProgress()[id]?.status === "done" ? "todo" : "done" });
    } else if (action.startsWith("bingo-replace:") && !shared) {
      ids = ids.map((id, index) => index === Number(action.split(":")[1]) ? shuffle(bingoIds.filter((item) => !ids.includes(item)))[0] : id);
    } else if (action === "bingo-shuffle" && !shared) ids = shuffle(bingoIds).slice(0, 9);
    else if (action === "bingo-add") {
      ids.filter((id) => readProgress()[id]?.status !== "done").forEach((id) => updateProgress(id, { status: "todo" }));
      scope.notice(scope.text("life_bingo_added"), main.querySelector<HTMLElement>(".bingo-controls") || main);
    } else if (action === "bingo-share") {
      const done = doneValues();
      const url = `${location.origin}${localePath(scope.locale, "/bingo/share")}?board=v1.${ids.join(".")}&done=d${done.map(Number).join("")}`;
      void showShare(scope, scope.text("life_bingo_sharetitle1"), ids.map((id, index) => `${done[index] ? "✓" : "○"} ${tipMap.get(id)?.title || id}`), url);
    }
    render();
  });
  if (shared) {
    main.querySelectorAll<HTMLElement>(".bingo-invalid, .bingo-share-empty").forEach((node) => scope.hide(node));
    scope.own(link(scope.text("life_bingo_try"), `${localePath(scope.locale, "/bingo")}?board=v1.${ids.join(".")}`, "life-button dark"));
  }
  scope.on(window, "how-progress", render);
  scope.on(window, "storage", render);
  render();
}

interface QuizState { questions: Array<{ id: string; order: number[] }>; answers: Array<number | null>; current: number; submitted: boolean }
const quizTopics = ["safety", "money", "digital", "focus", "learning"];

function newQuiz(): QuizState {
  return { questions: shuffle(quizTopics.flatMap((topic) => shuffle(quizQuestions.filter((question) => question.topic === topic)).slice(0, 4))).map((question) => ({ id: question.id, order: shuffle([0, 1, 2, 3]) })), answers: Array<null>(20).fill(null), current: 0, submitted: false };
}

function validQuiz(state: QuizState | null): state is QuizState {
  return !!state && Array.isArray(state.questions) && state.questions.length === 20 && new Set(state.questions.map((item) => item.id)).size === 20 && state.questions.every((item) => quizQuestions.some((question) => question.id === item.id) && Array.isArray(item.order) && [...item.order].sort().join("") === "0123") && Array.isArray(state.answers) && state.answers.length === 20 && state.answers.every((answer) => answer === null || (Number.isInteger(answer) && answer >= 0 && answer <= 3)) && Number.isInteger(state.current) && state.current >= 0 && state.current < 20 && typeof state.submitted === "boolean";
}

function quizResult(scope: ToolScope, counts: number[], share = true): HTMLElement {
  const total = counts.reduce((sum, count) => sum + count, 0), score = total * 5;
  const result = element("section", "quiz-result-summary");
  const level = score >= 90 ? "high" : score >= 70 ? "good" : score >= 50 ? "mid" : "low";
  result.append(element("div", "life-eyebrow", scope.text("life_quiz_result")), element("div", "quiz-score", element("strong", "", String(score)), element("span", "", "/ 100")), element("h2", "", scope.text(`life_quiz_level${level}1`)), element("p", "", scope.text("life_quiz_correctcount1", { count: total })));
  const topics = element("div", "quiz-breakdown");
  quizTopics.forEach((topic, index) => {
    const progress = element("progress"); progress.max = 4; progress.value = counts[index]; progress.setAttribute("aria-label", scope.text(`life_quiz_${topic}`));
    topics.append(element("div", "", element("span", "", scope.text(`life_quiz_${topic}`)), progress, element("b", "", `${counts[index]} / 4`)));
  });
  result.append(topics, element("p", "quiz-fine", scope.text("life_quiz_notice")));
  if (share) result.append(button(scope.text("life_quiz_card"), "quiz-share", "life-button dark"));
  return result;
}

function installQuiz(scope: ToolScope, shared: boolean): void {
  const { main } = scope;
  if (shared) {
    const parameter = new URLSearchParams(location.search).get("result") || "";
    if (!/^v1\.[0-4]{5}$/.test(parameter)) return;
    [...main.children].forEach((node) => { if (node instanceof HTMLElement) scope.hide(node); });
    scope.own(quizResult(scope, [...parameter.slice(3)].map(Number), false));
    scope.own(link(scope.text("life_quiz_start"), localePath(scope.locale, "/quiz"), "life-button dark"));
    return;
  }
  const saved = readStored<QuizState | null>("how-better-quiz", null);
  let state: QuizState | null = validQuiz(saved) ? saved : null;
  const intro = main.querySelector<HTMLElement>(".quiz-intro");
  const surface = scope.own(element("div"));
  if (intro) intro.after(surface);
  main.querySelectorAll<HTMLButtonElement>(".quiz-intro button,.quiz-guide-final button").forEach((node) => { node.disabled = false; node.textContent = scope.text("life_quiz_start"); node.dataset.toolAction = "quiz-start"; });
  const counts = () => quizTopics.map((topic) => state!.questions.reduce((count, item, index) => count + Number(quizQuestions.find((question) => question.id === item.id)?.topic === topic && state!.answers[index] === 0), 0));
  const move = (index: number) => { if (!state) return; state.current = index; render(); surface.querySelector<HTMLElement>("legend")?.focus(); };
  function render(): void {
    surface.replaceChildren();
    if (!state) return;
    if (intro) intro.hidden = true;
    saveStored("how-better-quiz", state);
    if (state.submitted && !state.answers.includes(null)) {
      surface.append(quizResult(scope, counts()));
      const review = element("section", "quiz-review", element("h2", "", scope.text("life_quiz_review")));
      state.questions.forEach((item, index) => {
        const question = quizQuestions.find((question) => question.id === item.id)!;
        const copy = question[scope.locale], correct = state!.answers[index] === 0;
        const details = element("details", `quiz-review-item ${correct ? "correct" : "incorrect"}`);
        details.open = !correct;
        details.append(element("summary", "", element("span", "quiz-review-status", scope.text(correct ? "life_quiz_right" : "life_quiz_wrong")), element("span", "", `${index + 1}. ${copy.question}`)), element("div", "quiz-review-body", !correct ? element("p", "quiz-chosen", `${scope.text("life_quiz_youranswer1")}: ${copy.options[state!.answers[index]!]}`) : null, element("p", "quiz-answer", `${scope.text("life_quiz_correctanswer1")}: ${copy.options[0]}`), element("p", "", copy.explanation), link(scope.text("life_quiz_source"), localePath(scope.locale, `/book/${question.entryId.slice(0, 2)}#${question.entryId}`))));
        review.append(details);
      });
      surface.append(review, button(scope.text("life_quiz_retry"), "quiz-retry", "life-button dark"));
      return;
    }
    const item = state.questions[state.current];
    const question = quizQuestions.find((question) => question.id === item.id)!;
    const copy = question[scope.locale];
    const answered = state.answers.filter((answer) => answer !== null).length;
    const test = element("section", "quiz-test");
    const progress = element("progress", "quiz-progress");
    progress.value = answered; progress.max = 20;
    test.append(element("div", "quiz-progress-heading", element("strong", "", scope.text("life_quiz_progress", { count: answered })), element("span", "", scope.text(`life_quiz_${question.topic}`))), progress);
    const fieldset = element("fieldset", "quiz-question");
    const legend = element("legend", "", element("span", "", scope.text("life_quiz_number", { number: state.current + 1 })), copy.question);
    legend.tabIndex = -1;
    const options = element("div", "quiz-options");
    item.order.forEach((value, index) => {
      const input = element("input"); input.type = "radio"; input.name = question.id; input.value = String(value); input.checked = state!.answers[state!.current] === value;
      const label = element("label", input.checked ? "selected" : "", input, element("span", "quiz-option-letter", String.fromCharCode(65 + index)), element("span", "", copy.options[value]));
      options.append(label);
    });
    fieldset.append(legend, element("p", "quiz-fine", scope.text("life_quiz_choose")), options);
    const previous = button(scope.text("life_quiz_previous"), "quiz-previous"); previous.disabled = state.current === 0;
    const next = button(scope.text(state.current === 19 ? "life_quiz_submit" : "life_quiz_next"), state.current === 19 ? "quiz-submit" : "quiz-next", "life-button dark"); next.disabled = state.current === 19 && answered < 20;
    test.append(fieldset, element("div", "quiz-actions quiz-question-actions", previous, next));
    const nav = element("nav", "quiz-question-nav"); nav.setAttribute("aria-label", scope.text("life_quiz_questionnav1"));
    state.questions.forEach((_, index) => {
      const jump = button(String(index + 1), `quiz-jump:${index}`, state!.answers[index] !== null ? "answered" : "");
      if (index === state!.current) jump.setAttribute("aria-current", "step");
      nav.append(jump);
    });
    test.append(nav, element("p", "quiz-fine", scope.text("life_quiz_saved")));
    surface.append(test);
  }
  scope.on(surface, "change", (event) => {
    if (!(event.target instanceof HTMLInputElement) || !state) return;
    state.answers[state.current] = Number(event.target.value);
    render();
    surface.querySelector<HTMLInputElement>(`input[value="${state.answers[state.current]}"]`)?.focus();
  });
  scope.action((action) => {
    if (action === "quiz-start" || action === "quiz-retry") { if (!state || action === "quiz-retry") state = newQuiz(); render(); surface.scrollIntoView({ block: "start", behavior: "smooth" }); }
    else if (action === "quiz-next" && state) move(Math.min(19, state.current + 1));
    else if (action === "quiz-previous" && state) move(Math.max(0, state.current - 1));
    else if (action.startsWith("quiz-jump:")) move(Number(action.split(":")[1]));
    else if (action === "quiz-submit" && state && !state.answers.includes(null)) { state.submitted = true; render(); surface.scrollIntoView({ block: "start", behavior: "smooth" }); }
    else if (action === "quiz-share" && state?.submitted) {
      const result = counts();
      void showShare(scope, `${scope.text("life_quiz_result")} · ${result.reduce((sum, value) => sum + value, 0) * 5} / 100`, quizTopics.map((topic, index) => `${scope.text(`life_quiz_${topic}`)}: ${result[index]} / 4`), `${location.origin}${localePath(scope.locale, "/quiz/share")}?result=v1.${result.join("")}`);
    }
  });
  if (intro) scope.cleaners.push(() => { intro.hidden = false; });
  render();
}

type CheckupTarget = "self" | "parents";
type CheckupAnswers = Record<string, string[]>;

function recommendTips(tips: Tip[], answers: CheckupAnswers, target: CheckupTarget, count: number): Tip[] {
  const weights = { ...checkupBaseWeights[target] };
  const keywords: Record<string, string[]> = {};
  for (const question of checkupDefinitions[target]) {
    for (const answer of answers[question.id] || []) {
      const option = question.options[answer];
      if (!option) continue;
      Object.entries(option.chapters).forEach(([chapter, value]) => { weights[chapter] = (weights[chapter] || 0) + value; });
      Object.entries(option.keywords || {}).forEach(([chapter, values]) => { (keywords[chapter] ||= []).push(...values); });
    }
  }
  const progress = readProgress();
  const positions: Record<string, number> = {};
  const ranked = tips.filter((tip) => {
    if (!(weights[tip.chapterId] > 0 || keywords[tip.chapterId])) return false;
    if (target === "parents" && (/怀孕|孕期|备孕|产检/.test(tip.title) || (!answers.living?.includes("grandkids") && /孩子|婴儿|新生儿|未成年|\d+ 岁以下|\d+ 岁以内/.test(tip.title)))) return false;
    return target === "parents" || progress[tip.id]?.status !== "done";
  }).map((tip) => {
    const tags = tip.tags;
    const benefit = ({ 大: 3, 中: 2, 小: 1 } as Record<string, number>)[tags.收益] ?? 1.5;
    const money = ({ "0": 1.5, 少: 0.5 } as Record<string, number>)[tags.钱] ?? 0;
    const willpower = ({ 否: 1, 些: 0.3 } as Record<string, number>)[tags.毅力] ?? 0;
    const order = positions[tip.chapterId] || 0;
    positions[tip.chapterId] = order + 1;
    const match = keywords[tip.chapterId]?.some((keyword) => tip.title.includes(keyword)) ? 4 : 0;
    return { tip, score: (weights[tip.chapterId] || 0) * 2 + benefit + money + Number(tags.时间 === "少") + willpower + match - order * 0.15 };
  }).sort((left, right) => right.score - left.score);
  const seen: Record<string, number> = {};
  const results: Tip[] = [];
  for (const { tip } of ranked) {
    if ((seen[tip.chapterId] || 0) >= (count > 10 ? 3 : 2)) continue;
    seen[tip.chapterId] = (seen[tip.chapterId] || 0) + 1;
    results.push(tip);
    if (results.length >= count) break;
  }
  return results;
}

async function installCheckup(scope: ToolScope, report: boolean): Promise<void> {
  const { main } = scope;
  const [localTips, chineseTips] = await Promise.all([loadTips(scope.locale), loadTips("zh")]);
  if (!scope.alive) return;
  const translations = new Map(localTips.map((tip) => [tip.id, tip]));
  const copy = checkupCopy[scope.locale];
  const text = (key: string, values: Record<string, string | number> = {}) => String(copy[key] || key).replace(/\{(\w+)\}/g, (whole, key: string) => String(values[key] ?? whole));
  let target: CheckupTarget = new URLSearchParams(location.search).get("for") === "parents" ? "parents" : "self";
  const storageKey = () => `how-better-checkup-${target}`;
  let answers: CheckupAnswers = {};
  let step = -1;
  let result: Tip[] = [];
  const originalNodes = [...main.children].filter((node): node is HTMLElement => node instanceof HTMLElement);
  const surface = scope.own(element("div"));
  const intro = main.querySelector<HTMLElement>(".checkup-intro");
  if (intro) intro.after(surface);
  const selfStart = main.querySelector<HTMLButtonElement>(".checkup-intro-actions > button");
  if (selfStart) selfStart.dataset.toolAction = "checkup-self";
  const parentsStart = main.querySelector<HTMLButtonElement>(".checkup-parents button");
  if (parentsStart) parentsStart.dataset.toolAction = "checkup-parents";
  const savedSelf = readStored<CheckupAnswers | null>("how-better-checkup-self", null);
  if (savedSelf && intro) scope.own(button(text("resume"), "checkup-resume"), intro.querySelector<HTMLElement>(".checkup-intro-actions") || intro);
  scope.cleaners.push(() => originalNodes.forEach((node) => { node.hidden = false; }));
  const finish = () => {
    saveStored(storageKey(), answers);
    result = recommendTips(chineseTips, answers, target, report ? 20 : 10).map((tip) => translations.get(tip.id) || tip);
    step = 5;
    render();
    surface.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  function render(): void {
    surface.replaceChildren();
    originalNodes.forEach((node) => { node.hidden = step !== -1; });
    if (step < 0) return;
    if (step < 5) {
      const definition = checkupDefinitions[target][step];
      const question = (target === "parents" ? copy.parents.questions : copy.questions)[definition.id];
      const selected = answers[definition.id] || [];
      const bar = element("span"); bar.style.width = `${(step + 1) * 20}%`;
      const card = element("section", "checkup-card", element("div", "checkup-progress", bar), element("div", "life-eyebrow", `${text("step", { current: step + 1, total: 5 })}${definition.multiple ? ` · ${text(definition.max ? "upTo" : "multiple", { max: definition.max || 0 })}` : ""}`), element("h1", "", question.title));
      const options = element("div", "checkup-options");
      options.setAttribute("role", definition.multiple ? "group" : "radiogroup");
      options.setAttribute("aria-label", question.title);
      Object.keys(definition.options).forEach((key) => {
        const chosen = selected.includes(key);
        const option = button("", `checkup-answer:${key}`, chosen ? "selected" : "");
        option.setAttribute("role", definition.multiple ? "checkbox" : "radio");
        option.setAttribute("aria-checked", String(chosen));
        option.append(element("span", "checkup-tick", chosen ? "✓" : ""), question.options[key]);
        options.append(option);
      });
      const next = button(text(step === 4 ? "finish" : "next"), "checkup-next", "life-button dark"); next.disabled = selected.length === 0;
      card.append(options, element("div", "checkup-nav", button(text("back"), "checkup-back", "life-button ghost"), next));
      surface.append(card);
      return;
    }
    const heading = target === "parents" ? copy.parents.resultTitle : text("resultTitle");
    const head = element("section", "checkup-result-head", element("div", "life-eyebrow", text("resultEyebrow")), element("h1", "", heading), element("p", "", target === "parents" ? copy.parents.resultLead : text("resultLead")));
    const progress = readProgress(), done = result.filter((tip) => progress[tip.id]?.status === "done").length;
    head.append(element("p", "checkup-score", text("progress", { done, total: result.length })), element("div", "checkup-intro-actions", button(text("addAll"), "checkup-add", "life-button dark"), button(scope.text("life_share_copylink1"), "checkup-share", "life-button ghost"), button(text("retake"), "checkup-retake", "life-button ghost"), ...(report ? [button(scope.locale === "zh" ? "打印 / 另存为 PDF" : "Print / Save PDF", "checkup-print")] : [link(scope.locale === "zh" ? "免费领取完整报告" : "Get the full report", `${localePath(scope.locale, "/checkup/report")}?for=${target}`)])));
    surface.append(head);
    const list = element("ol", "checkup-list");
    result.forEach((tip, index) => {
      const item = element("li", `checkup-item status-${progress[tip.id]?.status || "unmarked"}`, element("span", "checkup-rank", String(index + 1).padStart(2, "0")));
      const body = element("div", "", element("small", "", text("why", { chapter: tip.chapterTitle })), link(tip.title, localePath(scope.locale, `/tip/${tip.id}`), "checkup-item-title"), element("p", "", tip.summary || tip.benefit));
      const mark = button(scope.text(progress[tip.id]?.status === "done" ? "life_bingo_done" : "life_bingo_mark"), `checkup-done:${tip.id}`, `life-action done${progress[tip.id]?.status === "done" ? " selected" : ""}`);
      mark.setAttribute("aria-pressed", String(progress[tip.id]?.status === "done"));
      body.append(element("div", "checkup-item-actions", mark, button(progress[tip.id]?.status === "todo" ? (scope.locale === "zh" ? "已加入待做" : "Planned") : (scope.locale === "zh" ? "加入待做" : "Plan this"), `checkup-todo:${tip.id}`, `life-action todo${progress[tip.id]?.status === "todo" ? " selected" : ""}`), link(scope.text("life_quiz_source"), localePath(scope.locale, `/book/${tip.chapterId}#${tip.id}`))));
      if (report) body.append(element("p", "checkup-fine", `${tip.cost} · ${tip.benefit} · ${tip.evidence}`), element("p", "checkup-fine", tip.sources));
      item.append(body); list.append(item);
    });
    surface.append(list, element("p", "checkup-fine", text("disclaimer")), link(text("toDashboard"), localePath(scope.locale, "/dashboard"), "life-button dark"));
    if (report && target === "parents") surface.prepend(familyWorkspace(scope, answers));
  }
  scope.action((action) => {
    if (action === "checkup-self" || action === "checkup-parents" || action === "checkup-retake") { target = action === "checkup-parents" ? "parents" : action === "checkup-self" ? "self" : target; answers = {}; step = 0; render(); }
    else if (action === "checkup-resume") { target = "self"; answers = readStored(storageKey(), {}); finish(); }
    else if (action.startsWith("checkup-answer:")) {
      const question = checkupDefinitions[target][step], value = action.split(":")[1];
      const selected = answers[question.id] || [];
      if (!question.multiple) answers[question.id] = [value];
      else if (value === "none") answers[question.id] = selected.includes(value) ? [] : [value];
      else { const filtered = selected.filter((item) => item !== "none"); answers[question.id] = filtered.includes(value) ? filtered.filter((item) => item !== value) : [...filtered, value].slice(-(question.max || 100)); }
      render();
    } else if (action === "checkup-next") { if (step === 4) finish(); else { step++; render(); } }
    else if (action === "checkup-back") { step--; render(); }
    else if (action === "checkup-add") { result.filter((tip) => readProgress()[tip.id]?.status !== "done").forEach((tip) => updateProgress(tip.id, { status: "todo" })); render(); scope.notice(text("added"), surface); }
    else if (action.startsWith("checkup-done:")) { const id = action.split(":")[1]; updateProgress(id, { status: readProgress()[id]?.status === "done" ? "todo" : "done" }); render(); }
    else if (action.startsWith("checkup-todo:")) { updateProgress(action.split(":")[1], { status: "todo" }); render(); }
    else if (action === "checkup-share") void showShare(scope, target === "parents" ? copy.parents.resultTitle : text("resultTitle"), result.map((tip) => tip.title), `${location.origin}${localePath(scope.locale, "/checkup")}`);
    else if (action === "checkup-print") window.print();
  });
  if (report) {
    const requested = new URLSearchParams(location.search).get("plan");
    const existing = readFamilyPlans().find((plan) => plan.id === requested);
    if (existing) target = "parents";
    answers = existing?.answers || readStored(storageKey(), {});
    if (checkupDefinitions[target].every((question) => Array.isArray(answers[question.id]) && answers[question.id].length > 0)) finish();
    else {
      originalNodes.forEach((node) => { node.hidden = true; });
      surface.append(element("section", "checkup-intro", element("h1", "", text("title")), element("p", "", scope.locale === "zh" ? "这台设备上还没有体检记录，先回答 5 个问题，再生成完整报告。" : "Complete the five questions on this device to generate your report."), link(text("start"), localePath(scope.locale, "/checkup"), "life-button dark")));
    }
  } else if (target === "parents") { step = 0; render(); }
}

interface FamilyTask { done: boolean; owner: string; date: string; note: string }
interface FamilyPlan { id: string; answers: CheckupAnswers; person: string; start: string; updatedAt: string; appointment: string; concerns: string; medicines: string; documents: string; tasks: Record<string, FamilyTask> }

function readFamilyPlans(): FamilyPlan[] {
  const value = readStored<FamilyPlan[]>("how-better-family-plans", []);
  return Array.isArray(value) ? value.filter((plan) => plan && typeof plan.id === "string" && typeof plan.person === "string" && plan.answers && plan.tasks) : [];
}

function familyTasks(answers: CheckupAnswers): Array<{ id: string; day: number; priority: number }> {
  const has = (question: string, ...options: string[]) => options.some((option) => answers[question]?.includes(option));
  const tasks = [{ id: "records", day: 3, priority: 2 }, { id: "contact", day: 3, priority: has("living", "alone", "far") ? 0 : 3 }, { id: "visit", day: 14, priority: 5 }];
  if (has("health", "meds", "chronic")) tasks.push({ id: "medication", day: 7, priority: 1 });
  if (has("health", "mobility", "care") || has("living", "alone") || has("age", "p70", "p80")) tasks.push({ id: "home", day: 7, priority: 1 });
  if (has("money", "medical") || has("living", "far") || has("worry", "illness") || has("health", "care")) tasks.push({ id: "benefits", day: 14, priority: 4 });
  if (has("money", "phone", "pitch", "savings") || has("worry", "scam")) tasks.push({ id: "scam", day: 7, priority: has("money", "pitch") ? 0 : 3 });
  if (has("health", "care") || has("worry", "later") || has("age", "p80")) tasks.push({ id: "care", day: 30, priority: 6 });
  return tasks.sort((left, right) => left.priority - right.priority || left.day - right.day);
}

function familyWorkspace(scope: ToolScope, answers: CheckupAnswers): HTMLElement {
  const existingId = new URLSearchParams(location.search).get("plan");
  const saved = readFamilyPlans().find((plan) => plan.id === existingId);
  const plan: FamilyPlan = saved || { id: crypto.randomUUID(), answers, person: "", start: dateKey(), updatedAt: new Date().toISOString(), appointment: "", concerns: "", medicines: "", documents: "", tasks: {} };
  const tasks = familyTasks(plan.answers);
  for (const task of tasks) plan.tasks[task.id] ||= { done: false, owner: "", date: shiftedDate(plan.start, task.day), note: "" };
  const root = element("section", "parents-action-plan");
  const text = (key: string) => scope.text(`life_parentsplan_${key}`);
  const status = element("p", "practice-storage-note", text("saved1")); status.setAttribute("role", "status");
  const progress = element("p", "checkup-score");
  const save = () => {
    plan.updatedAt = new Date().toISOString();
    saveStored("how-better-family-plans", [...readFamilyPlans().filter((other) => other.id !== plan.id), plan]);
    progress.textContent = `${text("done1")} ${tasks.filter((task) => plan.tasks[task.id]?.done).length} / ${tasks.length}`;
    status.textContent = text("saved1");
  };
  const url = new URL(location.href); url.searchParams.set("for", "parents"); url.searchParams.set("plan", plan.id); history.replaceState(history.state, "", url);
  root.append(element("div", "report-block", element("div", "life-eyebrow", text("title1")), element("h1", "", text("title1")), element("p", "report-lead", text("lead1"))));
  const fields = element("div", "layoff-grid");
  for (const key of ["person", "start"] as const) {
    const input = element("input"); input.type = key === "start" ? "date" : "text"; input.name = `family-${key}`; input.value = plan[key]; input.maxLength = 80;
    input.addEventListener("input", () => { plan[key] = input.value; save(); });
    fields.append(element("label", "practice-field", element("span", "", text(`${key}1`)), input));
  }
  root.append(fields, progress);
  const actions = element("div", "checkup-intro-actions");
  const print = button(text("print1"), "", "life-button dark");
  print.addEventListener("click", () => window.print());
  const backup = button(text("download1"), "", "life-button ghost");
  backup.addEventListener("click", () => {
    const body = [`# ${text("title1")} — ${plan.person}`, `\n${text("start1")}: ${plan.start}`, ...tasks.flatMap((task) => [`\n## ${plan.tasks[task.id].done ? "✓ " : ""}${text(`${task.id}_title1`)}`, text(`${task.id}_steps1`), `${text("owner1")}: ${plan.tasks[task.id].owner}`, `${text("date1")}: ${plan.tasks[task.id].date}`, `${text("notes1")}: ${plan.tasks[task.id].note}`]), ...(["appointment", "concerns", "medicines", "documents"] as const).flatMap((key) => [`\n## ${text(`${key}1`)}`, plan[key]])].join("\n");
    download(new Blob([body], { type: "text/markdown;charset=utf-8" }), `family-plan-${plan.person || plan.id}.md`);
  });
  const calendar = button(text("calendar1"), "", "life-button ghost");
  calendar.addEventListener("click", () => {
    const events = tasks.filter((task) => !plan.tasks[task.id].done && /^\d{4}-\d{2}-\d{2}$/.test(plan.tasks[task.id].date)).flatMap((task) => ["BEGIN:VEVENT", `UID:${plan.id}-${task.id}@howtolivebetter.local`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`, `DTSTART;VALUE=DATE:${plan.tasks[task.id].date.replace(/-/g, "")}`, `SUMMARY:${text(`${task.id}_title1`).replace(/[\r\n,;]/g, " ")}`, "END:VEVENT"]);
    download(new Blob([["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//HowToLiveBetter//Family Plan//EN", ...events, "END:VCALENDAR"].join("\r\n")], { type: "text/calendar;charset=utf-8" }), "family-plan.ics");
  });
  actions.append(print, backup, calendar, link(scope.text("life_parentscloud_list1"), localePath(scope.locale, "/checkup/plans")));
  root.append(actions, status);
  tasks.forEach((task) => {
    const item = plan.tasks[task.id];
    const card = element("section", "report-block parents-task");
    const checkbox = element("input"); checkbox.type = "checkbox"; checkbox.checked = item.done; checkbox.name = `family-done-${task.id}`;
    checkbox.addEventListener("change", () => { item.done = checkbox.checked; save(); });
    card.append(element("h2", "", text(`${task.id}_title1`)), element("p", "", text(`${task.id}_why1`)), element("p", "", text(`${task.id}_steps1`)), element("p", "checkup-fine", `${text("outcome1")}: ${text(`${task.id}_outcome1`)}`), element("label", "practice-check", checkbox, text("done1")));
    const controls = element("div", "layoff-grid");
    for (const key of ["owner", "date", "note"] as const) {
      const input = key === "note" ? element("textarea") : element("input");
      if (input instanceof HTMLInputElement) input.type = key === "date" ? "date" : "text";
      input.name = `family-${task.id}-${key}`; input.value = item[key]; input.maxLength = key === "note" ? 2000 : 80;
      input.addEventListener("input", () => { item[key] = input.value; save(); });
      controls.append(element("label", "practice-field", element("span", "", text(key === "note" ? "notes1" : `${key}1`)), input));
    }
    card.append(controls); root.append(card);
  });
  const worksheet = element("section", "report-block parents-worksheet", element("h2", "", text("worksheet1")), element("p", "", text("worksheetlead2")));
  for (const key of ["appointment", "concerns", "medicines", "documents"] as const) {
    const field = element("textarea"); field.name = `family-${key}`; field.value = plan[key]; field.rows = 3; field.maxLength = 4000;
    field.addEventListener("input", () => { plan[key] = field.value; save(); });
    worksheet.append(element("label", "practice-field", element("span", "", text(`${key}1`)), field));
  }
  root.append(worksheet);
  save();
  return root;
}

function installFamilyPlans(scope: ToolScope): void {
  scope.main.querySelectorAll<HTMLElement>('[role="status"]').forEach((node) => scope.hide(node));
  const list = scope.own(element("div", "parents-plan-list"));
  function render(): void {
    list.replaceChildren();
    const plans = readFamilyPlans().sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    if (!plans.length) { list.append(element("p", "checkup-fine", scope.text("life_parentscloud_empty1"))); return; }
    for (const plan of plans) {
      const total = familyTasks(plan.answers).length, done = Object.values(plan.tasks).filter((task) => task.done).length;
      const remove = button(scope.text("life_parentscloud_delete1"), "", "life-button ghost");
      remove.addEventListener("click", () => {
        if (!window.confirm(scope.text("life_parentscloud_deleteconfirm2"))) return;
        saveStored("how-better-family-plans", readFamilyPlans().filter((item) => item.id !== plan.id)); render();
      });
      list.append(element("article", "checkup-card", element("h2", "", plan.person || scope.text("life_parentsplan_title1")), element("p", "", `${scope.text("life_parentsplan_done1")} ${done} / ${total}`), element("p", "checkup-fine", new Date(plan.updatedAt).toLocaleString(scope.locale)), element("div", "checkup-intro-actions", link(scope.text("life_parentscloud_continue1"), `${localePath(scope.locale, "/checkup/report")}?for=parents&plan=${encodeURIComponent(plan.id)}`, "life-button dark"), remove)));
    }
  }
  render();
}

interface PracticeRecord { id: string; kind: string; date: string; seconds: number; task: string }
interface PracticeTask { id: string; title: string; estimate: number; rounds: number; done: boolean }
interface ClockState { mode: string; duration: number; remaining: number; endsAt: number | null; status: "idle" | "running" | "paused" | "finished"; id: string }
interface PracticeSettings { focus: number; short: number; long: number; cycle: number; meditation: number; method: string; scene: string; volume: number; bell: boolean; notifications: boolean }

class AmbientSound {
  context: AudioContext | null = null;
  source: AudioBufferSourceNode | null = null;
  gain: GainNode | null = null;
  async play(scene: string, volume: number): Promise<void> {
    this.stop();
    if (scene === "off") return;
    this.context ||= new AudioContext();
    await this.context.resume();
    const context = this.context;
    const buffer = context.createBuffer(1, context.sampleRate * 8, context.sampleRate);
    const channel = buffer.getChannelData(0);
    let brown = 0;
    for (let index = 0; index < channel.length; index++) {
      const white = Math.random() * 2 - 1;
      brown = (brown + 0.02 * white) / 1.02;
      channel[index] = scene === "brown" ? brown * 3.5 : scene === "waves" ? brown * 4 * (0.45 + 0.4 * Math.sin(index / context.sampleRate * Math.PI / 4)) : white * (scene === "cafe" ? 0.35 : 0.22);
    }
    this.source = context.createBufferSource(); this.source.buffer = buffer; this.source.loop = true;
    const filter = context.createBiquadFilter(); filter.type = scene === "cafe" ? "bandpass" : "lowpass"; filter.frequency.value = scene === "rain" ? 2600 : scene === "cafe" ? 700 : 900;
    this.gain = context.createGain(); this.gain.gain.value = volume;
    this.source.connect(filter).connect(this.gain).connect(context.destination); this.source.start();
  }
  setVolume(volume: number): void { if (this.gain) this.gain.gain.value = volume; }
  stop(): void { this.source?.stop(); this.source?.disconnect(); this.source = null; this.gain?.disconnect(); this.gain = null; }
  async bell(): Promise<void> {
    this.context ||= new AudioContext();
    await this.context.resume();
    const start = this.context.currentTime;
    for (const [offset, frequency] of [[0, 523.25], [0.3, 659.25], [0.6, 783.99]]) {
      const oscillator = this.context.createOscillator(), gain = this.context.createGain();
      oscillator.frequency.value = frequency; gain.gain.setValueAtTime(0.0001, start + offset); gain.gain.exponentialRampToValueAtTime(0.12, start + offset + 0.03); gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 1.3);
      oscillator.connect(gain).connect(this.context.destination); oscillator.start(start + offset); oscillator.stop(start + offset + 1.4);
    }
  }
  dispose(): void { this.stop(); void this.context?.close(); }
}

function installPractice(scope: ToolScope, meditation: boolean): void {
  const { main } = scope;
  const kind = meditation ? "meditation" : "pomodoro";
  const storageKey = `how-better-${kind}`;
  const defaults: PracticeSettings = { focus: 25, short: 5, long: 15, cycle: 4, meditation: 5, method: "breath", scene: "off", volume: meditation ? 0.4 : 0.35, bell: true, notifications: false };
  const settings = { ...defaults, ...readStored<Partial<PracticeSettings>>(`${storageKey}-settings`, {}) };
  let clock = readStored<ClockState>(storageKey, { mode: meditation ? settings.method : "focus", duration: (meditation ? settings.meditation : settings.focus) * 60, remaining: (meditation ? settings.meditation : settings.focus) * 60, endsAt: null, status: "idle", id: crypto.randomUUID() });
  if (!Number.isFinite(clock.remaining) || !Number.isFinite(clock.duration) || clock.duration < 1 || !["idle", "running", "paused", "finished"].includes(clock.status)) clock = { mode: meditation ? "breath" : "focus", duration: 300, remaining: 300, endsAt: null, status: "idle", id: crypto.randomUUID() };
  const savedRecords = readStored<PracticeRecord[]>("how-better-practice-records", []);
  let records = Array.isArray(savedRecords) ? savedRecords.filter((record) => record && typeof record.id === "string" && typeof record.date === "string" && Number.isFinite(record.seconds)) : [];
  const savedTasks = readStored<PracticeTask[]>("how-better-pomodoro-tasks", []);
  let tasks = Array.isArray(savedTasks) ? savedTasks.filter((task) => task && typeof task.title === "string" && typeof task.id === "string") : [];
  let selectedTask = readStored<string>("how-better-pomodoro-selected", "");
  let intention = readStored<string>("how-better-pomodoro-intention", "");
  const audio = new AmbientSound();
  const stage = main.querySelector<HTMLElement>(meditation ? ".meditation-stage" : ".pomodoro-stage")!;
  const primary = main.querySelector<HTMLButtonElement>(".practice-primary")!;
  const display = main.querySelector<HTMLElement>('[role="timer"]')!;
  const initialTitle = document.title;
  const volume = main.querySelector<HTMLInputElement>('input[type="range"]');
  const scene = main.querySelector<HTMLSelectElement>(".practice-sound-controls select");
  const methods = [...main.querySelectorAll<HTMLButtonElement>(".meditation-methods button")];
  const durations = [...main.querySelectorAll<HTMLButtonElement>(".practice-duration button")];
  const modes = [...main.querySelectorAll<HTMLButtonElement>(".pomodoro-modes button")];
  const timers = [...main.querySelectorAll<HTMLButtonElement>(".practice-timer-actions button")];
  const stageTools = [...main.querySelectorAll<HTMLButtonElement>(".practice-stage-tools button,.meditation-stage-clock button")];
  main.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>("button,input,select").forEach((node) => { node.disabled = false; });
  primary.dataset.toolAction = "practice-toggle";
  if (timers[1]) timers[1].dataset.toolAction = "practice-reset";
  if (timers[2]) timers[2].dataset.toolAction = "practice-skip";
  stageTools.forEach((node, index) => { node.dataset.toolAction = !meditation && index === 0 ? "practice-settings" : "practice-immerse"; });
  methods.forEach((node, index) => { node.dataset.toolAction = `practice-method:${["breath", "silent", "scan"][index]}`; });
  durations.forEach((node, index) => { node.dataset.toolAction = `practice-duration:${[3,5,10,15][index]}`; });
  modes.forEach((node, index) => { node.dataset.toolAction = `practice-mode:${["focus", "short", "long"][index]}`; });
  const exportButton = main.querySelector<HTMLButtonElement>(".practice-history button");
  if (exportButton) exportButton.dataset.toolAction = "practice-export";
  const soundControls = main.querySelector<HTMLElement>(".practice-sound-controls");
  const playSound = soundControls ? scope.own(button(scope.text("practice_playsound1"), "practice-sound", "practice-small-button"), soundControls) : null;
  const save = () => { saveStored(storageKey, clock); saveStored(`${storageKey}-settings`, settings); };
  const saveTasks = () => { saveStored("how-better-pomodoro-tasks", tasks); saveStored("how-better-pomodoro-selected", selectedTask); saveStored("how-better-pomodoro-intention", intention); };
  const durationFor = (mode: string) => (meditation ? settings.meditation : mode === "short" ? settings.short : mode === "long" ? settings.long : settings.focus) * 60;
  const reset = (mode = clock.mode) => { clock = { mode, duration: durationFor(mode), remaining: durationFor(mode), endsAt: null, status: "idle", id: crypto.randomUUID() }; audio.stop(); save(); render(); };
  const remaining = () => clock.status === "running" && clock.endsAt !== null ? Math.max(0, Math.ceil((clock.endsAt - Date.now()) / 1000)) : clock.remaining;
  const countFocus = () => records.filter((record) => record.kind === "focus").length;
  const nextMode = () => clock.mode === "focus" ? countFocus() % settings.cycle === 0 && countFocus() > 0 ? "long" : "short" : "focus";
  const sound = () => { void audio.play(settings.scene, settings.volume).catch(() => scope.notice(scope.text("practice_audiounavailable1"), soundControls || main)); };
  function toggle(): void {
    if (clock.status === "running") { clock.remaining = remaining(); clock.endsAt = null; clock.status = "paused"; audio.stop(); }
    else {
      if (clock.status === "finished") reset(meditation ? settings.method : nextMode());
      clock.endsAt = Date.now() + clock.remaining * 1000; clock.status = "running";
      if (settings.scene !== "off") sound();
    }
    save(); render();
  }
  function complete(): void {
    clock.status = "finished"; clock.remaining = 0; clock.endsAt = null;
    audio.stop();
    if ((meditation || clock.mode === "focus") && !records.some((record) => record.id === clock.id)) {
      records = [...records, { id: clock.id, kind: meditation ? clock.mode : "focus", date: new Date().toISOString(), seconds: clock.duration, task: intention }];
      saveStored("how-better-practice-records", records);
      if (!meditation && selectedTask) { tasks = tasks.map((task) => task.id === selectedTask ? { ...task, rounds: task.rounds + 1 } : task); saveTasks(); renderTasks(); }
    }
    if (settings.bell) void audio.bell().catch(() => {});
    if (settings.notifications && "Notification" in window && Notification.permission === "granted") {
      try { new Notification(scope.text(meditation ? "meditation_notificationtitle1" : clock.mode === "focus" ? "pomodoro_notificationfocus1" : "pomodoro_notificationrest1"), { body: scope.text(meditation ? "meditation_notificationbody1" : "pomodoro_notificationbreak1") }); } catch { /* A visual finished state remains available. */ }
    }
    save(); renderHistory(); render();
  }
  function render(): void {
    const seconds = remaining();
    display.textContent = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
    primary.textContent = scope.text(clock.status === "running" ? "practice_pause" : clock.status === "paused" ? "practice_resume" : clock.status === "finished" ? "practice_again" : meditation ? "meditation_start" : clock.mode === "focus" ? "pomodoro_start" : "pomodoro_startbreak1");
    document.title = clock.status === "running" ? `${display.textContent} · ${initialTitle}` : initialTitle;
    if (volume) { volume.value = String(Math.round(settings.volume * 100)); volume.disabled = settings.scene === "off"; }
    if (scene) scene.value = settings.scene;
    if (playSound) { playSound.hidden = settings.scene === "off"; playSound.textContent = scope.text(audio.source ? "practice_mute" : "practice_playsound1"); }
    methods.forEach((node, index) => node.setAttribute("aria-pressed", String(["breath", "silent", "scan"][index] === settings.method)));
    durations.forEach((node, index) => node.setAttribute("aria-pressed", String([3,5,10,15][index] === settings.meditation)));
    modes.forEach((node, index) => node.setAttribute("aria-pressed", String(["focus", "short", "long"][index] === clock.mode)));
    if (!meditation) {
      stage.classList.remove("mode-focus", "mode-short", "mode-long"); stage.classList.add(`mode-${clock.mode}`);
      const label = main.querySelector(".pomodoro-intention strong"); if (label) label.textContent = intention || scope.text("pomodoro_onething1");
      const rounds = main.querySelector(".pomodoro-rounds");
      rounds?.replaceChildren(...Array.from({ length: settings.cycle }, (_, index) => element("span", index < countFocus() % settings.cycle ? "filled" : "", index < countFocus() % settings.cycle ? "●" : "○")));
    } else {
      const cue = main.querySelector(".meditation-cue");
      const label = main.querySelector(".practice-session-label");
      if (label) label.textContent = scope.text(`meditation_${settings.method}`);
      let key = clock.status === "finished" ? "meditation_finishedcue1" : "meditation_readycue1";
      if (clock.status === "running") {
        const elapsed = clock.duration - seconds;
        if (settings.method === "breath") key = elapsed % 10 < 4 ? "meditation_inhale" : "meditation_exhale";
        else if (settings.method === "scan") key = ["meditation_scan_feet", "meditation_scan_body", "meditation_scan_hands", "meditation_scan_face"][Math.min(3, Math.floor(elapsed / clock.duration * 4))];
        else key = ["meditation_silent_settle", "meditation_silent_observe", "meditation_silent_return"][Math.min(2, Math.floor(elapsed / clock.duration * 3))];
        const phase = elapsed % 10;
        main.querySelector<HTMLElement>(".meditation-orbit")?.style.setProperty("--breath-scale", String(settings.method === "breath" ? 1 + (phase < 4 ? phase / 4 : (10 - phase) / 6) * 0.14 : 1));
      }
      if (cue) cue.textContent = scope.text(key);
    }
  }
  function renderHistory(): void {
    const matching = records.filter((record) => meditation ? record.kind !== "focus" : record.kind === "focus");
    const today = matching.filter((record) => dateKey(new Date(record.date)) === dateKey());
    const totals = [...main.querySelectorAll<HTMLElement>(".practice-totals strong")];
    if (totals[0]) totals[0].textContent = String(Math.round(today.reduce((sum, record) => sum + record.seconds, 0) / 60));
    if (totals[1]) totals[1].textContent = String(today.length);
    const empty = main.querySelector<HTMLElement>(".practice-history .practice-empty"); if (empty) empty.hidden = matching.length > 0;
    if (exportButton) exportButton.disabled = matching.length === 0;
    const days = Array.from({ length: 7 }, (_, index) => {
      const day = shiftedDate(dateKey(), index - 6);
      return { day, value: Math.round(matching.filter((record) => dateKey(new Date(record.date)) === day).reduce((sum, record) => sum + record.seconds, 0) / 60) };
    });
    const maximum = Math.max(1, ...days.map((day) => day.value));
    const week = main.querySelector(".practice-week");
    week?.replaceChildren(...days.map(({ day, value }) => {
      const bar = element("i"); bar.style.setProperty("--bar-height", `${value / maximum * 100}%`);
      const column = element("div", "practice-week-day", element("strong", "", value ? String(value) : "·"), element("div", "practice-week-track", bar), element("span", "", new Intl.DateTimeFormat(scope.locale, { weekday: "narrow" }).format(new Date(`${day}T12:00:00`))));
      column.title = `${day}: ${value}`; return column;
    }));
    week?.setAttribute("aria-label", days.map((day) => `${day.day}: ${day.value}`).join("; "));
    const harvest = main.querySelector(".pomodoro-harvest-art strong"); if (harvest) harvest.textContent = String(today.length);
    const harvestGrid = main.querySelector(".pomodoro-harvest-grid"); harvestGrid?.replaceChildren(...Array.from({ length: Math.min(16, today.length) }, () => element("span", "", "🍅")));
  }
  function renderTasks(): void {
    if (meditation) return;
    const list = main.querySelector(".pomodoro-task-list");
    list?.replaceChildren(...tasks.map((task) => {
      const done = button(task.done ? "✓" : "○", `practice-task-done:${task.id}`, "pomodoro-task-check"); done.setAttribute("aria-label", scope.text(task.done ? "pomodoro_reopentask1" : "pomodoro_finishtask1")); done.setAttribute("aria-pressed", String(task.done));
      const select = button("", `practice-task-select:${task.id}`, "pomodoro-task-select"); select.append(element("strong", "", task.title), element("small", "", `${task.rounds} / ${task.estimate}`));
      const edit = button("✎", `practice-task-edit:${task.id}`, "practice-icon-button"); edit.setAttribute("aria-label", scope.text("pomodoro_edittask1"));
      const remove = button("×", `practice-task-delete:${task.id}`, "practice-icon-button"); remove.setAttribute("aria-label", scope.text("pomodoro_deletetask1"));
      return element("li", `${task.done ? "done" : ""} ${selectedTask === task.id ? "selected" : ""}`, done, select, edit, remove);
    }));
    const empty = main.querySelector<HTMLElement>(".pomodoro-tasks > .practice-empty"); if (empty) empty.hidden = tasks.length > 0;
    const count = main.querySelector(".pomodoro-tasks summary > span"); if (count) count.textContent = `${tasks.filter((task) => task.done).length}/${tasks.length}`;
    const chooser = main.querySelector(".pomodoro-todo-options > ul:not(.pomodoro-recommendations)");
    chooser?.replaceChildren(...tasks.filter((task) => !task.done).map((task) => element("li", "", button(task.title, `practice-task-select:${task.id}`, "pomodoro-recommendation"))));
  }
  const settingsPanel = scope.own(element("form", "practice-options"), stage);
  settingsPanel.id = "pomodoro-settings"; settingsPanel.hidden = true;
  if (!meditation) {
    settingsPanel.append(element("h2", "", scope.text("pomodoro_settings")));
    for (const key of ["focus", "short", "long", "cycle"] as const) {
      const input = element("input"); input.type = "number"; input.name = key; input.min = "1"; input.max = key === "cycle" ? "12" : "180"; input.value = String(settings[key]); input.required = true;
      settingsPanel.append(element("label", "practice-field", element("span", "", scope.text(key === "cycle" ? "pomodoro_longevery1" : `pomodoro_${key}`)), input));
    }
    const submit = button(scope.text("practice_save"), "", "practice-small-button"); submit.type = "submit"; delete submit.dataset.toolAction;
    settingsPanel.append(submit);
    scope.on(settingsPanel, "submit", (event) => { event.preventDefault(); const form = new FormData(settingsPanel); for (const key of ["focus", "short", "long", "cycle"] as const) settings[key] = Math.max(1, Math.min(key === "cycle" ? 12 : 180, Number(form.get(key)) || defaults[key])); settingsPanel.hidden = true; if (clock.status === "idle") reset(); save(); render(); });
  }
  scope.action((action) => {
    if (action === "practice-toggle") toggle();
    else if (action === "practice-reset") reset();
    else if (action === "practice-skip") reset(nextMode());
    else if (action.startsWith("practice-method:")) { settings.method = action.split(":")[1]; reset(settings.method); }
    else if (action.startsWith("practice-duration:")) { settings.meditation = Number(action.split(":")[1]); reset(settings.method); }
    else if (action.startsWith("practice-mode:")) reset(action.split(":")[1]);
    else if (action === "practice-settings") { settingsPanel.hidden = !settingsPanel.hidden; stageTools[0]?.setAttribute("aria-expanded", String(!settingsPanel.hidden)); }
    else if (action === "practice-immerse") { const active = main.classList.toggle("is-immersed"); stage.classList.toggle("is-immersed", active); stageTools.at(-1)?.setAttribute("aria-pressed", String(active)); }
    else if (action === "practice-sound") { if (audio.source) audio.stop(); else sound(); render(); }
    else if (action === "practice-export") {
      const quote = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
      const rows = records.filter((record) => meditation ? record.kind !== "focus" : record.kind === "focus").map((record) => [record.date, Math.round(record.seconds / 60), record.kind, record.task]);
      const csv = [[scope.text("practice_csv_date"), scope.text("practice_csv_minutes"), scope.text("practice_csv_mode"), scope.text("practice_csv_task")], ...rows].map((row) => row.map(quote).join(",")).join("\r\n");
      download(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }), `howtolivebetter-${kind}-${dateKey()}.csv`);
    } else if (action === "practice-task-open") { const details = main.querySelector<HTMLDetailsElement>(".pomodoro-tasks"); if (details) details.open = true; main.querySelector<HTMLInputElement>(".pomodoro-add-task input")?.focus(); }
    else if (action === "practice-task-picker") { const options = main.querySelector<HTMLElement>(".pomodoro-todo-options"); if (options) options.hidden = !options.hidden; main.querySelector(".pomodoro-todo-trigger")?.setAttribute("aria-expanded", String(!options?.hidden)); }
    else if (action.startsWith("practice-task-select:")) { selectedTask = action.split(":")[1]; intention = tasks.find((task) => task.id === selectedTask)?.title || ""; saveTasks(); renderTasks(); render(); }
    else if (action.startsWith("practice-task-done:")) { tasks = tasks.map((task) => task.id === action.split(":")[1] ? { ...task, done: !task.done } : task); saveTasks(); renderTasks(); }
    else if (action.startsWith("practice-task-delete:")) { tasks = tasks.filter((task) => task.id !== action.split(":")[1]); if (!tasks.some((task) => task.id === selectedTask)) selectedTask = ""; saveTasks(); renderTasks(); }
    else if (action.startsWith("practice-task-edit:")) {
      const task = tasks.find((task) => task.id === action.split(":")[1]);
      if (task) { const title = window.prompt(scope.text("pomodoro_taskname1"), task.title); if (title?.trim()) { task.title = title.trim().slice(0, 160); if (selectedTask === task.id) intention = task.title; saveTasks(); renderTasks(); render(); } }
    }
  });
  if (scene) { scene.value = settings.scene; scope.on(scene, "change", () => { settings.scene = scene.value; sound(); save(); render(); }); }
  if (volume) scope.on(volume, "input", () => { settings.volume = Number(volume.value) / 100; audio.setVolume(settings.volume); save(); });
  const notification = main.querySelector<HTMLInputElement>('.practice-notifications input[type="checkbox"]');
  if (notification) {
    notification.checked = settings.notifications && "Notification" in window && Notification.permission === "granted";
    scope.on(notification, "change", async () => {
      if (!notification.checked) { settings.notifications = false; save(); return; }
      try { settings.notifications = "Notification" in window && await Notification.requestPermission() === "granted"; }
      catch { settings.notifications = false; }
      notification.checked = settings.notifications;
      if (!settings.notifications) scope.notice(scope.text("practice_notificationsdenied1"), notification.closest<HTMLElement>(".practice-notifications") || main);
      save();
    });
  }
  if (meditation) {
    const bell = main.querySelector<HTMLInputElement>('.meditation-sound-panel > .practice-check input');
    if (bell) { bell.checked = settings.bell; scope.on(bell, "change", () => { settings.bell = bell.checked; save(); }); }
  } else {
    const add = main.querySelector<HTMLFormElement>(".pomodoro-add-task");
    if (add) scope.on(add, "submit", (event) => {
      event.preventDefault(); const input = add.querySelector<HTMLInputElement>("input")!, estimate = add.querySelector<HTMLSelectElement>("select")!;
      const title = input.value.trim(); if (!title) { input.focus(); return; }
      const task = { id: crypto.randomUUID(), title: title.slice(0, 160), estimate: Math.max(1, Number(estimate.value)), rounds: 0, done: false };
      tasks.push(task); if (!selectedTask) { selectedTask = task.id; intention = task.title; } input.value = ""; saveTasks(); renderTasks(); render();
    });
    main.querySelectorAll<HTMLButtonElement>(".pomodoro-recommendations button").forEach((node) => {
      scope.on(node, "click", (event) => { event.preventDefault(); selectedTask = ""; intention = node.textContent?.trim() || ""; saveTasks(); render(); });
    });
    const picker = main.querySelector<HTMLButtonElement>(".pomodoro-todo-trigger"); if (picker) picker.dataset.toolAction = "practice-task-picker";
    const open = main.querySelector<HTMLButtonElement>(".pomodoro-todo-options .practice-small-button"); if (open) open.dataset.toolAction = "practice-task-open";
  }
  scope.on(window, "keydown", (event) => {
    const key = event as KeyboardEvent;
    if (key.key === "Escape") { main.classList.remove("is-immersed"); stage.classList.remove("is-immersed"); }
    if (key.code !== "Space" || key.repeat || key.target instanceof HTMLInputElement || key.target instanceof HTMLTextAreaElement || key.target instanceof HTMLSelectElement || key.target instanceof HTMLButtonElement || (key.target instanceof HTMLElement && key.target.isContentEditable)) return;
    key.preventDefault(); toggle();
  });
  const tick = () => { if (clock.status === "running" && remaining() <= 0) complete(); else render(); };
  const timer = window.setInterval(tick, 500);
  scope.on(window, "focus", tick);
  scope.on(document, "visibilitychange", tick);
  scope.cleaners.push(() => { clearInterval(timer); audio.dispose(); document.title = initialTitle; main.classList.remove("is-immersed"); stage.classList.remove("is-immersed"); });
  renderTasks(); renderHistory(); tick();
}

interface LayoffInput {
  start: string; end: string; wage: number; lastWage: number; localAverage: number;
  leaveDays: number; reason: string; insurance: string; notified: boolean; nonCompete: boolean;
}

function addMonths(date: Date, count: number): Date {
  const result = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + count, 1));
  const maximum = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(date.getUTCDate(), maximum));
  return result;
}

function calculateLayoff(input: LayoffInput) {
  const start = new Date(`${input.start}T00:00:00Z`), end = new Date(`${input.end}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 1);
  let months = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth();
  if (addMonths(start, months) > end) months--;
  const years = Math.floor(months / 12), rest = months % 12;
  const rawUnits = years + (rest >= 6 ? 1 : rest > 0 || addMonths(start, months) < end ? 0.5 : 0);
  const cap = input.localAverage > 0 ? input.localAverage * 3 : Infinity;
  const capped = input.wage > cap;
  const units = capped ? Math.min(rawUnits, 12) : rawUnits;
  const base = Math.min(input.wage, cap);
  const severance = base * units;
  const notice = input.reason === "article40" && !input.notified ? input.lastWage || input.wage : 0;
  const damages = severance * 2;
  const expected = input.reason === "illegal" ? damages : input.reason === "misconduct" ? 0 : severance + notice;
  const leave = Math.max(0, input.leaveDays) * input.wage / 21.75 * 2;
  const exempt = input.localAverage * 36;
  const taxable = input.localAverage > 0 ? Math.max(0, severance - exempt) : 0;
  const brackets = [[36000,0.03,0],[144000,0.1,2520],[300000,0.2,16920],[420000,0.25,31920],[660000,0.3,52920],[960000,0.35,85920],[Infinity,0.45,181920]];
  const bracket = brackets.find(([maximum]) => taxable <= maximum)!;
  const tax = Math.max(0, taxable * bracket[1] - bracket[2]);
  const unemployment = ({ lt1: 0, "1to5": 12, "5to10": 18, ge10: 24 } as Record<string, number>)[input.insurance] || 0;
  return { years, rest, units, capped, base, severance, notice, damages, expected, leave, exempt, taxable, tax, unemployment };
}

function installLayoff(scope: ToolScope): void {
  const form = scope.main.querySelector<HTMLFormElement>(".layoff-form");
  if (!form) return;
  const labels = layoffCopy.form;
  const copy = layoffCopy.result;
  const format = (value: string, data: Record<string, string | number> = {}) => value.replace(/\{(\w+)\}/g, (whole, key: string) => String(data[key] ?? whole));
  const money = (value: number) => new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value);
  const [start, end] = [...form.querySelectorAll<HTMLInputElement>('input[type="date"]')];
  const [wage, average, leave] = [...form.querySelectorAll<HTMLInputElement>('input[inputmode="decimal"]')];
  if (!start || !end || !wage || !average || !leave) return;
  start.name = "start"; end.name = "end"; wage.name = "wage"; average.name = "localAverage"; leave.name = "leaveDays";
  for (const input of [wage, average, leave]) { input.type = "number"; input.min = "0"; input.step = "0.01"; }
  const reasonInputs = [...form.querySelectorAll<HTMLInputElement>('input[name="reason"]')];
  const reasons = ["mutual", "economic", "article40", "illegal", "misconduct", "unsure"];
  reasonInputs.forEach((input, index) => { input.value = reasons[index]; });
  const insuranceInputs = [...form.querySelectorAll<HTMLInputElement>('input[name="insurance"]')];
  insuranceInputs.forEach((input, index) => { input.value = ["lt1", "1to5", "5to10", "ge10"][index]; });
  const nonCompete = form.querySelector<HTMLInputElement>('.layoff-check input')!;
  nonCompete.name = "nonCompete";
  const notified = element("input"); notified.type = "checkbox"; notified.name = "notified";
  const notifiedLabel = scope.own(element("label", "layoff-check", notified, labels.notified), form);
  reasonInputs[0]?.closest("fieldset")?.after(notifiedLabel);
  const lastWage = element("input"); lastWage.type = "number"; lastWage.name = "lastWage"; lastWage.min = "0"; lastWage.step = "0.01";
  const lastLabel = scope.own(element("label", "", element("span", "", labels.lastWage), lastWage, element("small", "", labels.lastWageHint)), form.querySelector<HTMLElement>(".layoff-more")!);
  const resultElement = scope.own(element("section", "layoff-result")); resultElement.id = "layoff-result";
  form.after(resultElement);
  let savedInput = readStored<LayoffInput | null>("how-better-layoff", null);
  const updateForm = () => {
    const reason = reasonInputs.find((input) => input.checked)?.value;
    notifiedLabel.hidden = lastLabel.hidden = reason !== "article40";
    reasonInputs.forEach((input) => input.closest("label")?.classList.toggle("selected", input.checked));
    insuranceInputs.forEach((input) => input.closest("label")?.classList.toggle("selected", input.checked));
    average.required = Number(wage.value) >= 18000;
    average.setCustomValidity(average.required && !Number(average.value) ? labels.errorAverage : "");
  };
  const deadlines = (input: LayoffInput, unemployment: number) => {
    const date = new Date(`${input.end}T00:00:00Z`);
    const dateString = (date: Date) => date.toISOString().slice(0, 10);
    const inDays = (days: number) => { const item = new Date(date); item.setUTCDate(item.getUTCDate() + days); return dateString(item); };
    const items: Array<{ id: keyof typeof layoffCopy.deadlines; date: string; tip: string }> = [{ id: "register", date: inDays(7), tip: "07-01" }, { id: "transfer", date: inDays(15), tip: "19-17" }];
    if (!unemployment) items.push({ id: "insurance_gap", date: dateString(addMonths(date, 3)), tip: "19-19" });
    if (input.nonCompete) items.push({ id: "non_compete", date: dateString(addMonths(date, 3)), tip: "11-12" });
    if (unemployment) items.push({ id: "benefit_end", date: dateString(addMonths(date, unemployment)), tip: "07-09" });
    const arbitration = addMonths(date, 12); arbitration.setUTCDate(arbitration.getUTCDate() - 1);
    items.push({ id: "arbitration_warn", date: dateString(addMonths(date, 10)), tip: "08-19" }, { id: "arbitration", date: dateString(arbitration), tip: "08-19" });
    return items.sort((left, right) => left.date.localeCompare(right.date));
  };
  function render(input: LayoffInput): void {
    const result = calculateLayoff(input);
    resultElement.replaceChildren(element("div", "life-eyebrow", copy.eyebrow), element("p", "layoff-service", format(copy.service, { years: result.years, months: result.rest, units: result.units }) + (result.capped ? copy.serviceCapped : "")), element("div", "layoff-card layoff-total", element("span", "", copy.expected), element("strong", "", money(result.expected), element("small", "", " 元"))));
    const lines = element("dl", "layoff-lines");
    const line = (label: string, amount: number, detail: string, tip: string) => lines.append(element("div", "", element("dt", "", label), element("dd", "", `${money(amount)} 元`, element("small", "", detail), link("阅读对应原文", `/tip/${tip}`))));
    line(copy.severance, result.severance, format(copy.severanceDetail, { units: result.units, base: money(result.base) }), "19-04");
    if (result.notice) line(copy.noticePay, result.notice, copy.noticePayDetail, "19-05");
    if (input.reason === "illegal") line(copy.damages, result.damages, copy.damagesDetail, "19-06");
    if (result.leave) line(copy.leavePay, result.leave, copy.leavePayDetail, "19-02");
    resultElement.append(lines);
    if (input.reason === "misconduct" || input.reason === "unsure") resultElement.append(element("p", "layoff-note", format(input.reason === "misconduct" ? copy.misconductNote : copy.unsureNote, { amount: money(result.damages) })));
    if (input.start < "2008-01-01") resultElement.append(element("p", "layoff-note", copy.before2008));
    resultElement.append(element("div", "layoff-card", element("h3", "", copy.taxTitle), element("p", "", input.localAverage > 0 ? format(result.taxable > 0 ? copy.taxSome : copy.taxFree, { exempt: money(result.exempt), taxable: money(result.taxable), tax: money(result.tax) }) : copy.taxUnknown), element("small", "", copy.taxNote)), element("div", "layoff-card", element("h3", "", result.unemployment ? format(copy.unemployment, { months: result.unemployment }) : copy.unemploymentNone), result.unemployment ? element("p", "", copy.unemploymentDetail) : null), element("h2", "", copy.today));
    const today = element("ul", "layoff-today");
    layoffCopy.today.forEach((item) => today.append(element("li", "", element("span", "", "✓"), element("div", "", element("p", "", item.text), link("阅读对应原文", `/tip/${item.tip}`)))));
    resultElement.append(today, element("div", "layoff-section-head", element("h2", "", copy.deadlinesTitle), button(copy.addCalendar, "layoff-calendar", "life-button ghost")), element("p", "layoff-lead", format(copy.deadlinesLead, { end: input.end })));
    const timeline = element("ol", "deadline-list");
    deadlines(input, result.unemployment).forEach((item) => {
      const entry = layoffCopy.deadlines[item.id];
      timeline.append(element("li", "layoff-card", element("time", "", item.date), element("h3", "", entry.title), element("p", "", entry.detail), link("阅读对应原文", `/tip/${item.tip}`)));
    });
    resultElement.append(timeline, link(layoffCopy.paid.cta, "/layoff/pack", "life-button dark"));
  }
  scope.on(form, "input", updateForm);
  scope.on(form, "change", updateForm);
  scope.on(form, "submit", (event) => {
    event.preventDefault(); updateForm();
    if (!form.reportValidity()) return;
    if (!start.value || !end.value || end.value < start.value || Number(wage.value) <= 0) { scope.notice(end.value < start.value ? labels.errorDates : labels.errorWage, form); return; }
    const input: LayoffInput = { start: start.value, end: end.value, wage: Number(wage.value), lastWage: Number(lastWage.value), localAverage: Number(average.value), leaveDays: Number(leave.value), reason: reasonInputs.find((node) => node.checked)?.value || "mutual", insurance: insuranceInputs.find((node) => node.checked)?.value || "1to5", notified: notified.checked, nonCompete: nonCompete.checked };
    savedInput = input; saveStored("how-better-layoff", input); render(input); resultElement.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  scope.action((action) => {
    if (action !== "layoff-calendar" || !savedInput) return;
    const input = savedInput;
    const escape = (text: string) => text.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
    const events = deadlines(input, calculateLayoff(input).unemployment).flatMap((item) => {
      const copy = layoffCopy.deadlines[item.id];
      return ["BEGIN:VEVENT", `UID:layoff-${item.id}-${item.date}@howtolivebetter.local`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`, `DTSTART;VALUE=DATE:${item.date.replace(/-/g, "")}`, `DTEND;VALUE=DATE:${shiftedDate(item.date, 1).replace(/-/g, "")}`, `SUMMARY:${escape(copy.title)}`, `DESCRIPTION:${escape(`${copy.detail}\n${location.origin}/tip/${item.tip}`)}`, "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${escape(copy.title)}`, "TRIGGER:-P1D", "END:VALARM", "END:VEVENT"];
    });
    download(new Blob([["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//HowToLiveBetter//Layoff//ZH", "CALSCALE:GREGORIAN", ...events, "END:VCALENDAR", ""].join("\r\n")], { type: "text/calendar;charset=utf-8" }), copy.calendarFile);
  });
  if (savedInput && /^\d{4}-\d{2}-\d{2}$/.test(savedInput.start) && /^\d{4}-\d{2}-\d{2}$/.test(savedInput.end) && savedInput.wage > 0) {
    start.value = savedInput.start; end.value = savedInput.end; wage.value = String(savedInput.wage); average.value = savedInput.localAverage ? String(savedInput.localAverage) : ""; leave.value = savedInput.leaveDays ? String(savedInput.leaveDays) : ""; lastWage.value = savedInput.lastWage ? String(savedInput.lastWage) : ""; notified.checked = savedInput.notified; nonCompete.checked = savedInput.nonCompete;
    reasonInputs.forEach((input) => { input.checked = input.value === savedInput!.reason; }); insuranceInputs.forEach((input) => { input.checked = input.value === savedInput!.insurance; }); render(savedInput);
  }
  updateForm();
}

function installLayoffPack(scope: ToolScope): void {
  const input = readStored<LayoffInput | null>("how-better-layoff", null);
  const copy = layoffCopy.pack;
  const format = (value: string, data: Record<string, string | number> = {}) => value.replace(/\{(\w+)\}/g, (whole, key: string) => String(data[key] ?? whole));
  const amount = (value: number) => new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value);
  if (!input || !/^\d{4}-\d{2}-\d{2}$/.test(input.start) || !/^\d{4}-\d{2}-\d{2}$/.test(input.end) || !(input.wage > 0)) {
    scope.own(element("section", "layoff-intro", element("div", "life-eyebrow", copy.eyebrow), element("h1", "", copy.title), element("p", "", copy.empty), link(copy.backToTool, "/layoff", "life-button dark")));
    return;
  }
  const result = calculateLayoff(input);
  const print = button(copy.print, "layoff-pack-print", "life-button dark");
  scope.own(element("section", "layoff-intro", element("div", "life-eyebrow", copy.eyebrow), element("h1", "", copy.title), element("p", "layoff-fine", format(copy.generated, { date: dateKey() })), element("div", "layoff-actions no-print", print, link(layoffCopy.result.recalc, "/layoff", "life-button ghost")), element("p", "layoff-fine no-print", copy.printHint)));
  const summary = element("dl", "layoff-table");
  const rows: Array<[string, string]> = [
    [copy.summaryRows.service, format(layoffCopy.result.service, { years: result.years, months: result.rest, units: result.units })],
    [copy.summaryRows.base, `${amount(result.base)} 元`], [copy.summaryRows.severance, `${amount(result.severance)} 元`],
    [copy.summaryRows.noticePay, result.notice ? `${amount(result.notice)} 元` : copy.notApplicable],
    [copy.summaryRows.damages, `${amount(result.damages)} 元`], [copy.summaryRows.leavePay, result.leave ? `${amount(result.leave)} 元` : copy.notApplicable],
    [copy.summaryRows.tax, input.localAverage ? `${amount(result.tax)} 元` : copy.unknown],
    [copy.summaryRows.unemployment, result.unemployment ? format(copy.monthsUnit, { months: result.unemployment }) : copy.notApplicable],
  ];
  rows.forEach(([label, value]) => summary.append(element("div", "", element("dt", "", label), element("dd", "", value))));
  scope.own(element("section", "layoff-block", element("h2", "", copy.summaryTitle), summary, element("p", "layoff-fine", layoffCopy.notAdvice)));
  const deadlineList = element("ol", "layoff-numbered");
  const end = new Date(`${input.end}T00:00:00Z`), arbitration = addMonths(end, 12); arbitration.setUTCDate(arbitration.getUTCDate() - 1);
  const dates: Array<[keyof typeof layoffCopy.deadlines, string]> = [["register", shiftedDate(input.end, 7)], ["transfer", shiftedDate(input.end, 15)]];
  if (!result.unemployment) dates.push(["insurance_gap", addMonths(end, 3).toISOString().slice(0, 10)]);
  if (input.nonCompete) dates.push(["non_compete", addMonths(end, 3).toISOString().slice(0, 10)]);
  if (result.unemployment) dates.push(["benefit_end", addMonths(end, result.unemployment).toISOString().slice(0, 10)]);
  dates.push(["arbitration_warn", addMonths(end, 10).toISOString().slice(0, 10)], ["arbitration", arbitration.toISOString().slice(0, 10)]);
  dates.sort((left, right) => left[1].localeCompare(right[1])).forEach(([id, date]) => {
    const item = layoffCopy.deadlines[id]; deadlineList.append(element("li", "", element("strong", "", `${date} · ${item.title}`), element("p", "", item.detail)));
  });
  scope.own(element("section", "layoff-block", element("h2", "", copy.deadlinesTitle), deadlineList));
  const collection = (title: string, texts: string[], className: string, lead = "") => {
    const list = element("ul", className); texts.forEach((text) => list.append(element("li", "", text)));
    scope.own(element("section", "layoff-block", element("h2", "", title), lead ? element("p", "layoff-lead", lead) : null, list));
  };
  collection(copy.evidenceTitle, copy.evidence, "layoff-checklist", copy.evidenceLead);
  collection(copy.askTitle, copy.ask, "layoff-numbered");
  collection(copy.signTitle, copy.sign, "layoff-numbered");
  const template = copy.template;
  const claims = [format(input.reason === "illegal" ? template.claimDamages : template.claimSeverance, { amount: amount(input.reason === "illegal" ? result.damages : result.severance) }), ...(result.notice ? [format(template.claimNotice, { amount: amount(result.notice) })] : []), ...(result.leave ? [format(template.claimLeave, { amount: amount(result.leave) })] : []), template.claimOther, template.claimCertificate];
  const list = element("ol"); claims.forEach((claim) => list.append(element("li", "", claim)));
  scope.own(element("section", "layoff-block", element("h2", "", copy.templateTitle), element("p", "layoff-lead", copy.templateLead), element("article", "layoff-template", element("h3", "", template.heading), element("p", "", template.applicant), element("p", "", template.respondent), element("strong", "", template.claimsTitle), list, element("strong", "", template.factsTitle), element("p", "", format(template.facts, { start: input.start, end: input.end, wage: amount(input.wage) })), element("p", "layoff-template-closing", template.closing), element("p", "", template.attachments))));
  const month = element("ul", "layoff-today");
  copy.month.forEach((item) => month.append(element("li", "", element("div", "", element("p", "", item.text), link("阅读对应原文", `/tip/${item.tip}`)))));
  scope.own(element("section", "layoff-block", element("h2", "", copy.monthTitle), month));
  collection(copy.phonesTitle, copy.phones, "layoff-checklist plain");
  const feedback = scope.own(element("aside", "layoff-paid layoff-feedback no-print", element("h2", "", copy.feedbackTitle), element("p", "", copy.feedbackLead)));
  if (readStored("how-better-layoff-feedback", "")) feedback.append(element("p", "", copy.thanks));
  else feedback.append(element("div", "layoff-actions", button(copy.worth, "layoff-pack-worth", "life-button dark"), button(copy.notWorth, "layoff-pack-not-worth", "life-button ghost")));
  scope.own(element("p", "layoff-fine", format(copy.attribution, { revision: "公开" })));
  scope.action((action) => {
    if (action === "layoff-pack-print") window.print();
    else if (action === "layoff-pack-worth" || action === "layoff-pack-not-worth") { saveStored("how-better-layoff-feedback", action); feedback.querySelector(".layoff-actions")?.remove(); feedback.append(element("p", "", copy.thanks)); }
  });
}

/** Attach local, editable tool logic to the semantic React page tree. */
export function installToolBehaviors(root: HTMLElement, route: string): Cleanup {
  const main = root.matches("main") ? root : root.querySelector<HTMLElement>("main");
  if (!main) return () => {};
  const locale = routeLocale(route) as ToolLocale;
  const path = route.replace(/^\/(en|es|ja|ru|vi)(?=\/|$)/, "").replace(/\/$/, "") || "/";
  const scope = new ToolScope(main, locale);
  const failed = () => { if (scope.alive) scope.notice(scope.locale === "zh" ? "数据暂时未能加载，请刷新后重试。" : "The data could not be loaded. Please refresh to retry."); };
  if (path === "/daily") installDaily(scope);
  else if (path === "/bingo" || path === "/bingo/share") void installBingo(scope, path.endsWith("/share")).catch(failed);
  else if (path === "/quiz" || path === "/quiz/share") installQuiz(scope, path.endsWith("/share"));
  else if (path === "/checkup" || path === "/checkup/report") void installCheckup(scope, path.endsWith("/report")).catch(failed);
  else if (path === "/checkup/plans") installFamilyPlans(scope);
  else if (path === "/meditation" || path === "/pomodoro") installPractice(scope, path === "/meditation");
  else if (path === "/layoff") installLayoff(scope);
  else if (path === "/layoff/pack") installLayoffPack(scope);
  return () => scope.cleanup();
}
