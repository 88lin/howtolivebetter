import {
  loadTips,
  localePath,
  PROGRESS_KEY,
  progressSummary,
  readProgress,
  readerFilterCopy,
  routeLocale,
  updateProgress,
  valueTier,
  type Progress,
  type ProgressStatus,
  type Tip,
} from "./reader-data";

const copy = {
  zh: ["已做到", "待做", "已忽略", "收藏", "尚未标记", "我的备注", "写下对自己有用的提醒…", "保存", "取消", "成本", "收益", "原始出处", "原书备注", "收起详情", "展开依据与备注", "条结果", "全部主题", "没有匹配的结果，试试其他关键词。", "链接已复制", "复制链接", "关闭", "重置筛选", "打开来源链接", "数据暂时无法加载，请刷新重试。", "暂无条目", "我的清单", "全选项", "生成分享页"],
  en: ["Done", "To do", "Ignored", "Saved", "Unmarked", "My note", "Write a useful reminder…", "Save", "Cancel", "Cost", "Benefit", "Sources", "Book note", "Hide details", "Evidence & notes", "results", "All topics", "No matches. Try another keyword.", "Link copied", "Copy link", "Close", "Reset filters", "Open source", "Could not load data. Please refresh.", "No entries yet", "My checklist", "All", "Create share page"],
  ja: ["できている", "やること", "保留", "保存済み", "未選択", "自分のメモ", "自分に役立つメモを書く…", "保存", "キャンセル", "コスト", "効果", "出典", "原書の注記", "詳細を閉じる", "根拠とメモを開く", "件の結果", "すべてのテーマ", "一致する結果がありません。", "リンクをコピーしました", "リンクをコピー", "閉じる", "絞り込みをリセット", "出典を開く", "データを読み込めません。再読み込みしてください。", "項目はありません", "マイリスト", "すべて", "共有ページを作成"],
  es: ["Hecho", "Pendiente", "Descartado", "Guardado", "Sin marcar", "Mi nota", "Escribe un recordatorio útil…", "Guardar", "Cancelar", "Costo", "Beneficio", "Fuentes", "Nota del libro", "Ocultar detalles", "Evidencia y notas", "resultados", "Todos los temas", "Sin resultados. Prueba otra palabra.", "Enlace copiado", "Copiar enlace", "Cerrar", "Restablecer filtros", "Abrir fuente", "No se pudieron cargar los datos. Recarga la página.", "Aún no hay entradas", "Mi lista", "Todos", "Crear página para compartir"],
  ru: ["Сделано", "В планах", "Пропущено", "Избранное", "Без отметки", "Моя заметка", "Напишите полезное напоминание…", "Сохранить", "Отмена", "Затраты", "Польза", "Источники", "Примечание книги", "Скрыть подробности", "Доказательства и заметки", "результатов", "Все темы", "Ничего не найдено. Попробуйте другой запрос.", "Ссылка скопирована", "Копировать ссылку", "Закрыть", "Сбросить фильтры", "Открыть источник", "Не удалось загрузить данные. Обновите страницу.", "Записей пока нет", "Мой список", "Все", "Создать страницу для публикации"],
  vi: ["Đã làm", "Cần làm", "Bỏ qua", "Đã lưu", "Chưa đánh dấu", "Ghi chú của tôi", "Viết lời nhắc hữu ích…", "Lưu", "Hủy", "Chi phí", "Lợi ích", "Nguồn", "Ghi chú sách", "Ẩn chi tiết", "Bằng chứng và ghi chú", "kết quả", "Tất cả chủ đề", "Không có kết quả. Thử từ khóa khác.", "Đã sao chép liên kết", "Sao chép liên kết", "Đóng", "Đặt lại bộ lọc", "Mở nguồn", "Không thể tải dữ liệu. Hãy tải lại trang.", "Chưa có mục nào", "Danh sách của tôi", "Tất cả", "Tạo trang chia sẻ"],
} as const;

type Labels = readonly string[];
type EntryFilter = "all" | ProgressStatus | "favorite";

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function button(className: string, text: string) {
  const node = element("button", className, text);
  node.type = "button";
  return node;
}

function visible(node: HTMLElement, show: boolean) {
  node.hidden = !show;
  node.style.display = show ? "" : "none";
}

function setText(root: ParentNode, selector: string, text: string) {
  const node = root.querySelector(selector);
  if (node) node.textContent = text;
}

function replaceLeadingText(node: HTMLElement | null, text: string) {
  if (!node) return;
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE || child.nodeType === Node.COMMENT_NODE) child.remove();
  }
  node.prepend(document.createTextNode(text));
}

function entryId(card: HTMLElement): string {
  if (/^\d{2}-\d{2}$/.test(card.id)) return card.id;
  const href = card.querySelector<HTMLAnchorElement>(".top50-source")?.getAttribute("href") || "";
  return href.split("#")[1] || card.dataset.readerId || "";
}

function appendCitations(parent: HTMLElement, text: string) {
  // Render source content as text and safe links, never as executable markup.
  const pattern = /<(https?:\/\/[^>]+)>|(https?:\/\/[^\s<>]+)/g;
  let end = 0;
  for (const match of text.matchAll(pattern)) {
    const offset = match.index || 0;
    parent.append(document.createTextNode(text.slice(end, offset)));
    const url = (match[1] || match[2]).replace(/[.,;，；。]+$/, "");
    const link = element("a", "", url);
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    parent.append(link);
    end = offset + match[0].length;
  }
  parent.append(document.createTextNode(text.slice(end)));
}

async function copyLink(url: string, source: HTMLButtonElement, labels: Labels) {
  try {
    await navigator.clipboard.writeText(url);
    const feedback = element("span", "life-sync-state", labels[18]);
    feedback.setAttribute("role", "status");
    source.after(feedback);
    window.setTimeout(() => feedback.remove(), 1800);
  } catch {
    // Browsers without Clipboard permission retain a selectable link.
    const field = element("input");
    field.value = url;
    field.readOnly = true;
    field.setAttribute("aria-label", labels[19]);
    source.after(field);
    field.select();
    field.addEventListener("blur", () => field.remove(), { once: true });
  }
}

function createNote(progress: Progress, id: string, labels: Labels) {
  const note = element("div", "life-personal-note");
  note.append(element("span", "life-detail-label", labels[5]));
  note.append(button("", progress[id]?.note || labels[6]));
  return note;
}

function detailsFor(tip: Tip, progress: Progress, labels: Labels) {
  const details = element("div", "life-entry-details");
  const sections = [
    [labels[9], tip.cost], [labels[10], tip.benefit],
    [labels[11], tip.sources], [labels[12], tip.note],
  ];
  for (const [title, body] of sections) {
    if (!body) continue;
    const section = element("div");
    section.append(element("span", "life-detail-label", title));
    const paragraph = element("p", "life-citations");
    appendCitations(paragraph, body);
    section.append(paragraph);
    details.append(section);
  }
  if (!tip.sources && tip.sourceHref) {
    const source = element("a", "life-source-link", labels[22]);
    source.href = tip.sourceHref;
    source.target = "_blank";
    source.rel = "noopener noreferrer";
    details.append(source);
  }
  details.append(createNote(progress, tip.id, labels));
  return details;
}

function matchesFilter(tip: Tip, progress: Progress, filter: EntryFilter) {
  const state = progress[tip.id];
  if (filter === "all") return !!state && !!(state.status || state.favorite || state.note);
  if (filter === "favorite") return !!state?.favorite;
  return state?.status === filter;
}

/** Bind interactions to the source's semantic document after React hydration. */
export function installReaderBehaviors(root: HTMLElement, route: string): () => void {
  const locale = routeLocale(route);
  const labels: Labels = copy[locale as keyof typeof copy] || copy.zh;
  const filterLabels = readerFilterCopy[locale] || readerFilterCopy.zh;
  const main = root.querySelector<HTMLElement>("main") || root;
  const isBook = main.classList.contains("life-book-page");
  const isDashboard = main.classList.contains("life-dashboard");
  const hasReader = !!main.querySelector(".life-entry-card, .top50-item");
  const isGlossary = main.classList.contains("life-glossary-page");
  if (!isBook && !isDashboard && !hasReader && !isGlossary) return () => {};

  let disposed = false;
  let tips: Tip[] = [];
  let tipMap = new Map<string, Tip>();
  let progress = readProgress();
  let chapter = "";
  let search = "";
  let dashboardFilter: EntryFilter = "all";
  const selected = new Map<string, Set<string>>();
  const cards = Array.from(main.querySelectorAll<HTMLElement>(".life-entry-card, .top50-item"));
  const dialogs = new Set<HTMLDialogElement>();
  const cleanup: (() => void)[] = [];
  const resultGrid = main.querySelector<HTMLElement>(".life-chapter-grid");
  const results = isBook ? element("div", "life-results-list") : null;
  if (results && resultGrid) { results.hidden = true; resultGrid.after(results); }

  const nativeDone = main.querySelector(".life-action.done")?.textContent?.trim() || labels[0];
  const nativeTodo = main.querySelector(".life-action.todo")?.textContent?.trim() || labels[1];

  function showError() {
    if (disposed) return;
    const status = main.querySelector(".life-results-heading [role=status]");
    if (status) status.textContent = labels[23];
  }

  function renderProgress() {
    progress = readProgress();
    for (const card of cards) {
      const id = entryId(card);
      const state = progress[id];
      for (const value of ["unmarked", "done", "todo", "ignored"]) card.classList.remove(`status-${value}`);
      card.classList.add(`status-${state?.status || "unmarked"}`);
      for (const kind of ["done", "todo", "favorite"] as const) {
        const control = card.querySelector<HTMLButtonElement>(`.life-action.${kind}`);
        if (!control) continue;
        const pressed = kind === "favorite" ? !!state?.favorite : state?.status === kind;
        control.classList.toggle("selected", pressed);
        control.setAttribute("aria-pressed", String(pressed));
      }
      const topActions = Array.from(card.querySelectorAll<HTMLButtonElement>(".top50-actions button"));
      topActions.forEach((control, index) => {
        const value = (["done", "todo", "ignored"] as const)[index];
        control.disabled = false;
        control.setAttribute("aria-pressed", String(state?.status === value));
        control.classList.toggle("selected", state?.status === value);
      });
      if (card.classList.contains("top50-item")) {
        card.classList.remove("pending", "done", "todo", "ignored");
        card.classList.add(state?.status || "pending");
      }
      const note = card.querySelector<HTMLButtonElement>(".life-personal-note > button");
      if (note) note.textContent = state?.note || labels[6];
    }
    const chapterIds = cards.filter((card) => card.classList.contains("life-entry-card")).map(entryId);
    if (chapterIds.length) {
      const summary = progressSummary(chapterIds, progress);
      setText(main, ".life-chapter-progress strong", String(summary.score));
      setText(main, ".life-chapter-progress > small", `${summary.done} ${nativeDone} · ${summary.todo} ${nativeTodo} · ${summary.unmarked} ${labels[4]}`);
      const bar = main.querySelector<HTMLElement>(".life-chapter-progress-bar > div");
      if (bar) bar.style.width = `${summary.score}%`;
    }
    renderTop50();
    if (isDashboard && tips.length) renderDashboard();
  }

  function renderTop50() {
    const topCards = cards.filter((card) => card.classList.contains("top50-item"));
    if (!topCards.length) return;
    const counts = progressSummary(topCards.map(entryId), progress);
    const marked = topCards.length - counts.unmarked;
    replaceLeadingText(main.querySelector(".top50-progress-card > strong"), String(marked));
    const track = main.querySelector<HTMLElement>(".top50-progress-track > span");
    if (track) track.style.width = `${marked * 2}%`;
    main.querySelectorAll(".top50-counts b").forEach((node, index) => {
      node.textContent = String([counts.done, counts.todo, counts.ignored][index]);
    });
    const remaining = main.querySelector<HTMLElement>(".top50-progress-card > p");
    if (remaining) {
      remaining.dataset.readerTemplate ||= remaining.textContent || "";
      remaining.textContent = remaining.dataset.readerTemplate.replace(/50/, String(counts.unmarked));
    }
    main.querySelectorAll<HTMLElement>(".top50-group").forEach((group) => {
      const ids = Array.from(group.querySelectorAll<HTMLElement>(".top50-item")).map(entryId);
      setText(group, ".top50-group-heading small", `${ids.filter((id) => progress[id]?.status).length} / ${ids.length}`);
    });
    const share = main.querySelector<HTMLButtonElement>(".top50-share-button");
    if (share) share.disabled = marked === 0;
  }

  function renderDashboard() {
    const summary = progressSummary(tips.map((tip) => tip.id), progress);
    setText(main, ".life-score-ring strong", String(summary.score));
    main.querySelector<HTMLElement>(".life-score-ring")?.style.setProperty("--life-score", String(summary.score));
    for (const key of ["done", "todo", "unmarked", "favorite"] as const) {
      setText(main, `.life-count-card.${key} strong`, String(summary[key]));
    }
    main.querySelectorAll<HTMLElement>(".life-topic-progress").forEach((topic) => {
      const id = topic.querySelector(".life-topic-progress-id")?.textContent?.trim();
      const counts = progressSummary(tips.filter((tip) => tip.chapterId === id).map((tip) => tip.id), progress);
      replaceLeadingText(topic.querySelector(".life-topic-progress-score"), String(counts.score));
      setText(topic, ":scope > div > small", `${counts.done} ${labels[0]} · ${counts.todo} ${labels[1]}`);
      const bar = topic.querySelector<HTMLElement>(".life-mini-bar > span");
      if (bar) bar.style.width = `${counts.score}%`;
    });
    const filters: EntryFilter[] = ["all", "done", "todo", "ignored", "favorite"];
    main.querySelectorAll<HTMLButtonElement>(".life-filter-tabs button").forEach((control, index) => {
      control.classList.toggle("active", dashboardFilter === filters[index]);
      control.setAttribute("aria-pressed", String(dashboardFilter === filters[index]));
      setText(control, "span", String(tips.filter((tip) => matchesFilter(tip, progress, filters[index])).length));
    });
    const list = main.querySelector<HTMLElement>(".life-dashboard-items");
    if (!list) return;
    const matched = tips.filter((tip) => matchesFilter(tip, progress, dashboardFilter));
    if (!matched.length) {
      if (!list.querySelector(".life-empty-list")) {
        const empty = element("div", "life-empty-list");
        empty.append(element("span", "", "✳"), element("p", "", labels[24]));
        const start = element("a", "life-button dark", labels[16]);
        start.href = localePath(locale, "/book");
        empty.append(start);
        list.replaceChildren(empty);
      }
      return;
    }
    const fragment = document.createDocumentFragment();
    for (const tip of matched) {
      const state = progress[tip.id];
      const row = element("a", "life-dashboard-item");
      row.href = tip.href;
      row.append(element("span", "life-dashboard-item-num", tip.id));
      const body = element("div");
      body.append(element("strong", "", tip.title), element("small", "", state?.note || tip.chapterTitle));
      const statusLabel = state?.status === "done" ? labels[0] : state?.status === "todo" ? labels[1] : state?.status === "ignored" ? labels[2] : state?.favorite ? labels[3] : labels[5];
      row.append(body, element("span", `life-status-pill ${state?.status || ""}`, statusLabel), element("span", "", "→"));
      fragment.append(row);
    }
    list.replaceChildren(fragment);
  }

  function renderBook() {
    if (!results || !resultGrid || !tips.length) return;
    const query = search.toLocaleLowerCase().trim();
    const active = !!(query || chapter || selected.size);
    const panel = main.querySelector<HTMLElement>(".book-filter-panel");
    if (panel) {
      let reset = panel.querySelector<HTMLButtonElement>(":scope > [data-reader-reset]");
      if (active && !reset) {
        reset = button("book-filter-reset", filterLabels.reset);
        reset.dataset.readerReset = "true";
        panel.append(reset);
      } else if (!active) reset?.remove();
      const keys = [["value"], ["口径"], ["evidence"], ["钱", "时间", "毅力"]];
      panel.querySelectorAll<HTMLButtonElement>(".book-filter-trigger").forEach((control, index) => {
        control.querySelector("[data-reader-filter-count]")?.remove();
        const count = keys[index].reduce((sum, key) => sum + (selected.get(key)?.size || 0), 0);
        control.toggleAttribute("data-selected", count > 0);
        if (count) {
          const optionLabels: Record<string, string> = {
            very_high: filterLabels.very_high, high: filterLabels.high, standard: filterLabels.standard,
            "死亡率": filterLabels.life, "金钱": filterLabels.moneyresource1, "时间": filterLabels.timeresource1, "自由": filterLabels.freedom,
            A: filterLabels.gradea1, B: filterLabels.gradeb1, C: filterLabels.gradec1,
          };
          const single = Array.from(selected.get(keys[index][0]) || [])[0];
          const detail = index < 3 && count === 1 ? optionLabels[single] || single : count;
          const label = element("span", "", ` · ${detail}`);
          label.dataset.readerFilterCount = "true";
          const arrow = control.querySelector("svg");
          if (arrow) arrow.before(label); else control.append(label);
        }
      });
    }
    visible(resultGrid, !active);
    visible(results, active);
    const matched = tips.filter((tip) => {
      if (chapter && tip.chapterId !== chapter) return false;
      if (query && ![tip.title, tip.summary, tip.cost, tip.benefit, tip.sources, tip.note, tip.chapterTitle].join(" ").toLocaleLowerCase().includes(query)) return false;
      for (const [key, values] of selected) {
        if (key === "evidence" && !values.has(tip.evidence.charAt(0))) return false;
        if (key === "value" && !values.has(valueTier(tip) || "")) return false;
        if (key !== "evidence" && key !== "value" && !values.has(tip.tags[key])) return false;
      }
      return true;
    });
    const chapterTitle = chapter ? tips.find((tip) => tip.chapterId === chapter)?.chapterTitle : labels[16];
    setText(main, ".life-results-heading h2", chapterTitle || labels[16]);
    setText(main, ".life-results-heading .life-eyebrow", query ? `“${search}”` : chapterTitle || labels[16]);
    setText(main, ".life-results-heading [role=status]", `${matched.length} ${labels[15]}`);
    if (!active) { results.replaceChildren(); return; }
    const fragment = document.createDocumentFragment();
    if (!matched.length) fragment.append(element("p", "life-empty-list", filterLabels.empty));
    for (const tip of matched) {
      const row = element("a", "life-result-row");
      row.href = tip.href;
      row.append(element("span", "", tip.id));
      const body = element("div");
      body.append(element("h3", "", tip.title), element("p", "", tip.summary));
      row.append(body, element("span", "", "→"));
      fragment.append(row);
    }
    results.replaceChildren(fragment);
  }

  function closeFilters() {
    main.querySelectorAll(".book-filter-popover").forEach((node) => node.remove());
    main.querySelectorAll(".book-filter-trigger").forEach((node) => node.setAttribute("aria-expanded", "false"));
  }

  function openFilters(trigger: HTMLButtonElement) {
    const wasOpen = trigger.getAttribute("aria-expanded") === "true";
    closeFilters();
    if (wasOpen) return;
    const panel = trigger.closest(".book-filter-panel");
    if (!panel) return;
    const index = Array.from(panel.querySelectorAll(".book-filter-trigger")).indexOf(trigger);
    const popover = element("div", "book-filter-popover");
    const groups: [string, string, [string, string][]][] = [];
    if (index === 0) groups.push([filterLabels.value, "value", [["very_high", filterLabels.very_high], ["high", filterLabels.high], ["standard", filterLabels.standard]]]);
    if (index === 1) groups.push([filterLabels.resource, "口径", [["死亡率", filterLabels.life], ["金钱", filterLabels.moneyresource1], ["时间", filterLabels.timeresource1], ["自由", filterLabels.freedom]]]);
    if (index === 2) groups.push([filterLabels.evidence, "evidence", [["A", filterLabels.gradea1], ["B", filterLabels.gradeb1], ["C", filterLabels.gradec1]]]);
    if (index === 3) {
      groups.push([filterLabels.money, "钱", [["0", filterLabels.free], ["少", filterLabels.littlemoney1], ["多", filterLabels.muchmoney1]]]);
      groups.push([filterLabels.time, "时间", [["少", filterLabels.littletime1], ["中", filterLabels.mediumtime1], ["多", filterLabels.muchtime1]]]);
      groups.push([filterLabels.effort, "毅力", [["否", filterLabels.noeffort1], ["些", filterLabels.someeffort1], ["是", filterLabels.mucheffort1]]]);
    }
    for (const [title, key, options] of groups) {
      const fieldset = element("fieldset", "book-filter-group");
      fieldset.append(element("legend", "", title));
      const choices = element("div");
      for (const [value, text] of options) {
        const choice = button("", text);
        choice.dataset.readerFilter = key;
        choice.dataset.readerValue = value;
        choice.setAttribute("aria-pressed", String(selected.get(key)?.has(value) || false));
        choices.append(choice);
      }
      fieldset.append(choices);
      popover.append(fieldset);
    }
    popover.append(element("p", "book-filter-hint", filterLabels.hint));
    if (index === 0) popover.append(element("p", "book-filter-note", filterLabels.note));
    panel.append(popover);
    trigger.setAttribute("aria-expanded", "true");
  }

  function editNote(container: HTMLElement, id: string) {
    if (container.querySelector("textarea")) return;
    container.querySelector("button")?.remove();
    const area = element("textarea");
    area.value = progress[id]?.note || "";
    area.rows = 4;
    area.maxLength = 20000;
    area.setAttribute("aria-label", labels[5]);
    const actions = element("div");
    const save = button("", labels[7]);
    const cancel = button("", labels[8]);
    save.dataset.readerSaveNote = id;
    cancel.dataset.readerCancelNote = id;
    actions.append(save, document.createTextNode(" "), cancel);
    container.append(area, actions);
    area.focus();
  }

  function finishNote(control: HTMLButtonElement, save: boolean) {
    const container = control.closest<HTMLElement>(".life-personal-note");
    const id = control.dataset.readerSaveNote || control.dataset.readerCancelNote || "";
    if (!container) return;
    if (save) updateProgress(id, { note: container.querySelector("textarea")?.value || "" });
    const replacement = createNote(readProgress(), id, labels);
    container.replaceWith(replacement);
    replacement.querySelector("button")?.focus();
  }

  function showSharePage(shared?: Record<string, ProgressStatus>) {
    const topCards = cards.filter((card) => card.classList.contains("top50-item"));
    const data: Record<string, ProgressStatus> = shared || Object.fromEntries(topCards.flatMap((card) => {
      const id = entryId(card);
      const status = progress[id]?.status;
      return status ? [[id, status]] : [];
    }));
    const url = new URL(localePath(locale, "/top-50"), location.origin);
    url.searchParams.set("share", Object.entries(data).map(([id, status]) => `${id}:${status}`).join(","));
    const dialog = element("dialog", "life-community-dialog");
    dialog.setAttribute("aria-label", labels[25]);
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const close = button("life-button", labels[20]);
    close.addEventListener("click", () => dialog.close());
    const paper = element("section", "top50-share-card");
    const head = element("div", "top50-share-card-head");
    const count = Object.keys(data).length;
    head.append(element("span", "", labels[25]), element("h2", "", `${count} / 50`));
    paper.append(head);
    const stats = element("div", "top50-share-stats");
    (["done", "todo", "ignored"] as const).forEach((status, index) => {
      const stat = element("div");
      stat.append(element("strong", "", String(Object.values(data).filter((value) => value === status).length)), element("span", "", labels[index]));
      stats.append(stat);
    });
    paper.append(stats);
    const list = element("div", "life-dashboard-items");
    for (const [id, status] of Object.entries(data)) {
      const sourceCard = topCards.find((card) => entryId(card) === id);
      if (!sourceCard) continue;
      const row = element("a", "life-dashboard-item");
      row.href = localePath(locale, `/book/${id.slice(0, 2)}#${id}`);
      row.append(element("span", "life-dashboard-item-num", id), element("strong", "", sourceCard.querySelector("h3")?.textContent || id), element("span", `life-status-pill ${status}`, labels[status === "done" ? 0 : status === "todo" ? 1 : 2]));
      list.append(row);
    }
    paper.append(list);
    const share = button("life-button dark", labels[19]);
    share.addEventListener("click", () => { void copyLink(url.href, share, labels); });
    dialog.append(close, paper, share);
    document.body.append(dialog);
    dialogs.add(dialog);
    dialog.addEventListener("close", () => { dialogs.delete(dialog); dialog.remove(); previousFocus?.focus(); });
    dialog.showModal();
  }

  function exportCsv() {
    const escape = (value: string) => `"${(/^[=+@\-\t\r]/.test(value) ? "'" + value : value).replaceAll('"', '""')}"`;
    const rows = [["ID", labels[16], "Title", "Status", labels[3], labels[5]]];
    for (const tip of tips.filter((item) => matchesFilter(item, progress, dashboardFilter))) {
      const state = progress[tip.id];
      rows.push([tip.id, tip.chapterTitle, tip.title, state?.status || "", state?.favorite ? "1" : "0", state?.note || ""]);
    }
    const blob = new Blob(["\uFEFF" + rows.map((row) => row.map(escape).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const download = element("a");
    download.href = url;
    download.download = "howtolivebetter-progress.csv";
    download.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function click(event: MouseEvent) {
    const target = event.target instanceof Element ? event.target : null;
    const control = target?.closest<HTMLButtonElement>("button");
    if (!control || !main.contains(control)) return;
    const card = control.closest<HTMLElement>(".life-entry-card, .top50-item");
    const id = card ? entryId(card) : "";
    if (card && control.matches(".life-action, .top50-actions button")) {
      event.preventDefault();
      if (control.classList.contains("favorite")) updateProgress(id, { favorite: !progress[id]?.favorite });
      else {
        const status: ProgressStatus = control.classList.contains("done") ? "done" : control.classList.contains("todo") ? "todo" : (["done", "todo", "ignored"] as const)[Array.from(control.parentElement?.children || []).indexOf(control)];
        updateProgress(id, { status: progress[id]?.status === status ? undefined : status });
      }
    } else if (card && control.matches(".life-detail-toggle")) {
      event.preventDefault();
      let details = card.querySelector<HTMLElement>(".life-entry-details");
      const expanded = control.getAttribute("aria-expanded") !== "true";
      if (!details) {
        const tip = tipMap.get(id);
        if (!tip) return;
        details = detailsFor(tip, progress, labels);
        card.append(details);
      }
      visible(details, expanded);
      control.setAttribute("aria-expanded", String(expanded));
      const label = control.querySelector<HTMLElement>("span");
      if (label) replaceLeadingText(label, labels[expanded ? 13 : 14]);
      else control.textContent = labels[expanded ? 13 : 14];
    } else if (card && control.matches(".life-personal-note > button")) {
      event.preventDefault();
      editNote(control.parentElement!, id);
    } else if (control.dataset.readerSaveNote || control.dataset.readerCancelNote) {
      event.preventDefault();
      finishNote(control, !!control.dataset.readerSaveNote);
    } else if (card && control.matches(".social-share-trigger")) {
      event.preventDefault();
      event.stopPropagation();
      void copyLink(new URL(localePath(locale, `/tip/${id}`), location.origin).href, control, labels);
    } else if (control.matches(".top50-share-button")) {
      event.preventDefault();
      showSharePage();
    } else if (control.matches(".life-export-button")) {
      event.preventDefault();
      exportCsv();
    } else if (isDashboard && control.matches(".life-filter-tabs button")) {
      dashboardFilter = (["all", "done", "todo", "ignored", "favorite"] as const)[Array.from(main.querySelectorAll(".life-filter-tabs button")).indexOf(control)];
      renderDashboard();
    } else if (isBook && control.matches(".life-book-sidebar button")) {
      const buttons = Array.from(main.querySelectorAll<HTMLButtonElement>(".life-book-sidebar button"));
      const index = buttons.indexOf(control);
      chapter = index === 0 ? "" : String(index).padStart(2, "0");
      buttons.forEach((node) => { node.classList.toggle("active", node === control); node.setAttribute("aria-pressed", String(node === control)); });
      closeFilters();
      renderBook();
    } else if (isBook && control.matches(".book-filter-trigger")) {
      openFilters(control);
    } else if (control.dataset.readerFilter) {
      const key = control.dataset.readerFilter;
      const value = control.dataset.readerValue || "";
      const values = selected.get(key) || new Set<string>();
      if (values.has(value)) values.delete(value); else values.add(value);
      if (values.size) selected.set(key, values); else selected.delete(key);
      control.setAttribute("aria-pressed", String(values.has(value)));
      main.querySelectorAll<HTMLElement>(".book-filter-trigger").forEach((node, index) => {
        const keys = [["value"], ["口径"], ["evidence"], ["钱", "时间", "毅力"]][index];
        node.toggleAttribute("data-selected", keys.some((key) => selected.has(key)));
      });
      renderBook();
    } else if (control.dataset.readerReset) {
      selected.clear();
      chapter = "";
      search = "";
      const field = main.querySelector<HTMLInputElement>(".life-search-wrap input");
      if (field) field.value = "";
      main.querySelectorAll(".life-book-sidebar button").forEach((node, index) => {
        node.classList.toggle("active", index === 0);
        node.setAttribute("aria-pressed", String(index === 0));
      });
      main.querySelectorAll(".book-filter-trigger").forEach((node) => node.removeAttribute("data-selected"));
      closeFilters();
      renderBook();
    }
  }

  function input(event: Event) {
    const field = event.target;
    if (!(field instanceof HTMLInputElement)) return;
    if (isBook && field.closest(".life-search-wrap")) {
      search = field.value;
      renderBook();
    }
    if (isGlossary && field.closest(".life-glossary-search")) {
      const query = field.value.trim().toLocaleLowerCase();
      let count = 0;
      main.querySelectorAll<HTMLElement>(".life-glossary-row").forEach((row) => {
        const match = (row.textContent || "").toLocaleLowerCase().includes(query);
        visible(row, match);
        if (match) count++;
      });
      setText(main, ".life-glossary-count", String(count));
      let empty = main.querySelector<HTMLElement>("[data-reader-glossary-empty]");
      if (!empty) {
        empty = element("p", "life-empty-list", labels[17]);
        empty.dataset.readerGlossaryEmpty = "true";
        main.querySelector(".life-glossary-list")?.append(empty);
      }
      visible(empty, count === 0);
    }
  }

  function keydown(event: KeyboardEvent) {
    if (event.key === "Escape") closeFilters();
    if (!(event.target instanceof HTMLTextAreaElement)) return;
    if (event.key === "Escape" || (event.key === "Enter" && (event.ctrlKey || event.metaKey))) {
      const selector = event.key === "Escape" ? "[data-reader-cancel-note]" : "[data-reader-save-note]";
      const action = event.target.closest(".life-personal-note")?.querySelector<HTMLButtonElement>(selector);
      if (action) { event.preventDefault(); action.click(); }
    }
  }

  function storage(event: StorageEvent) {
    if (event.key === PROGRESS_KEY || event.key === null) renderProgress();
  }

  const outsideClick = (event: MouseEvent) => {
    if (event.target instanceof Element && !event.target.closest(".book-filter-panel")) closeFilters();
  };
  main.addEventListener("click", click);
  main.addEventListener("input", input);
  main.addEventListener("keydown", keydown);
  document.addEventListener("click", outsideClick);
  window.addEventListener("how-progress", renderProgress);
  window.addEventListener("storage", storage);
  cleanup.push(() => {
    main.removeEventListener("click", click);
    main.removeEventListener("input", input);
    main.removeEventListener("keydown", keydown);
    document.removeEventListener("click", outsideClick);
    window.removeEventListener("how-progress", renderProgress);
    window.removeEventListener("storage", storage);
  });
  renderProgress();

  if (isBook || isDashboard || hasReader) {
    void loadTips(locale).then((data) => {
      if (disposed) return;
      tips = data;
      tipMap = new Map(data.map((tip) => [tip.id, tip]));
      renderProgress();
      if (isBook) renderBook();
    }).catch(showError);
  }

  const shared = new URLSearchParams(location.search).get("share");
  if (shared && main.querySelector(".top50-item")) {
    const data: Record<string, ProgressStatus> = {};
    for (const part of shared.split(",").slice(0, 50)) {
      const [id, status] = part.split(":");
      if (/^\d{2}-\d{2}$/.test(id) && (status === "done" || status === "todo" || status === "ignored") && cards.some((card) => entryId(card) === id)) data[id] = status;
    }
    if (Object.keys(data).length) showSharePage(data);
  }

  return () => {
    disposed = true;
    cleanup.forEach((run) => run());
    dialogs.forEach((dialog) => { dialog.close(); dialog.remove(); });
    results?.remove();
    closeFilters();
  };
}
