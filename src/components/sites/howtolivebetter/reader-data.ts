export type ProgressStatus = "done" | "todo" | "ignored";

export interface TipProgress {
  status?: ProgressStatus;
  favorite?: boolean;
  note?: string;
}

export type Progress = Record<string, TipProgress>;

export interface Tip {
  id: string;
  chapterId: string;
  chapterTitle: string;
  locale: string;
  title: string;
  summary: string;
  cost: string;
  benefit: string;
  evidence: string;
  sources: string;
  note: string;
  tags: Record<string, string>;
  href: string;
  sourceHref: string;
  fullDetails?: boolean;
}

export const PROGRESS_KEY = "how-better-progress";
const locales = new Set(["zh", "en", "ja", "es", "ru", "vi"]);
const tipRequests = new Map<string, Promise<Tip[]>>();
let memoryProgress: Progress = {};
let memoryOnly = false;

export function routeLocale(route: string): string {
  const first = route.split("/")[1];
  return locales.has(first) ? first : "zh";
}

export function localePath(locale: string, path: string): string {
  return (locale === "zh" ? "" : `/${locale}`) + path;
}

export function loadTips(locale = "zh"): Promise<Tip[]> {
  const language = locales.has(locale) ? locale : "zh";
  let request = tipRequests.get(language);
  if (!request) {
    request = fetch(`/sites/howtolivebetter/tips-${language}.json`)
      .then((response) => {
        if (!response.ok) throw new Error(`Unable to load reading data (${response.status})`);
        return response.json() as Promise<Tip[]>;
      })
      .catch((error: unknown) => {
        tipRequests.delete(language);
        throw error;
      });
    tipRequests.set(language, request);
  }
  return request;
}

export function readProgress(): Progress {
  if (memoryOnly) return memoryProgress;
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(PROGRESS_KEY) || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const progress: Progress = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (!/^\d{2}-\d{2}$/.test(id) || !value || typeof value !== "object") continue;
      const item = value as Record<string, unknown>;
      const clean: TipProgress = {};
      if (item.status === "done" || item.status === "todo" || item.status === "ignored") clean.status = item.status;
      if (item.favorite === true) clean.favorite = true;
      if (typeof item.note === "string" && item.note) clean.note = item.note;
      if (Object.keys(clean).length) progress[id] = clean;
    }
    memoryProgress = progress;
    return progress;
  } catch {
    memoryOnly = true;
    return memoryProgress;
  }
}

export function updateProgress(id: string, patch: TipProgress): void {
  if (!/^\d{2}-\d{2}$/.test(id)) return;
  const progress = readProgress();
  const updated = { ...progress[id], ...patch };
  if (!updated.status) delete updated.status;
  if (!updated.favorite) delete updated.favorite;
  if (!updated.note) delete updated.note;
  if (Object.keys(updated).length) progress[id] = updated;
  else delete progress[id];
  memoryProgress = progress;
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // A blocked/full storage area still allows interaction for this page session.
    memoryOnly = true;
  }
  window.dispatchEvent(new CustomEvent("how-progress", { detail: { id } }));
}

export function progressSummary(ids: string[], progress: Progress) {
  const done = ids.filter((id) => progress[id]?.status === "done").length;
  const todo = ids.filter((id) => progress[id]?.status === "todo").length;
  const ignored = ids.filter((id) => progress[id]?.status === "ignored").length;
  const favorite = ids.filter((id) => progress[id]?.favorite).length;
  const unmarked = ids.length - done - todo - ignored;
  const score = ids.length ? Math.round(((done + todo * 0.4) / ids.length) * 100) : 0;
  return { done, todo, ignored, favorite, unmarked, score };
}

/** The book's cost/benefit tiers compare tags within the same resource category. */
export function valueTier(tip: Pick<Tip, "tags">): "very_high" | "high" | "standard" | null {
  const money: Record<string, number> = { "0": 0, "少": 1, "多": 2 };
  const time: Record<string, number> = { "少": 0, "中": 1, "多": 2 };
  const effort: Record<string, number> = { "否": 0, "些": 1, "是": 2 };
  const costs = [money[tip.tags["钱"]], time[tip.tags["时间"]], effort[tip.tags["毅力"]]];
  if (costs.some((cost) => cost === undefined)) return null;
  const total = costs.reduce((sum, cost) => sum + cost, 0);
  if (tip.tags["收益"] === "大") return total === 0 ? "very_high" : total <= 2 ? "high" : "standard";
  if (tip.tags["收益"] === "中") return total === 0 ? "high" : "standard";
  return tip.tags["收益"] === "小" ? "standard" : null;
}

// Public interface text extracted as data; no source JavaScript is imported.
export const readerFilterCopy: Record<string, Record<string, string>> = {
  "zh": {
    "costs": "执行成本",
    "effort": "要毅力",
    "empty": "没有符合这些条件的建议，试试减少筛选条件或更换关键词。",
    "evidence": "证据等级",
    "free": "不花钱",
    "freedom": "人身自由",
    "gradea1": "A 级",
    "gradeb1": "B 级",
    "gradec1": "C 级",
    "high": "高",
    "hint": "同组多选取“或”，不同组之间取“且”。可与关键词、章节一起筛选。",
    "life": "寿命",
    "littlemoney1": "少量花费",
    "littletime1": "顺手就做",
    "mediumtime1": "几小时",
    "money": "花钱",
    "moneyresource1": "金钱",
    "mucheffort1": "很多",
    "muchmoney1": "较多花费",
    "muchtime1": "每天占用",
    "noeffort1": "不用",
    "note": "性价比按原书的成本标签和收益量级计算，是作者判断；只在同类资源内比较。证据等级单独判断，带“争议”的条目仍计入其原等级。",
    "reset": "清空全部筛选",
    "resource": "换回什么",
    "results": "符合条件的建议",
    "someeffort1": "一点",
    "standard": "一般",
    "time": "花时间",
    "timeresource1": "时间与精力",
    "title": "筛选建议",
    "value": "性价比",
    "very_high": "极高"
  },
  "en": {
    "costs": "Action costs",
    "effort": "Sustained effort",
    "empty": "No suggestions match these conditions. Remove a filter or try another keyword.",
    "evidence": "Evidence grade",
    "free": "Free",
    "freedom": "Personal freedom",
    "gradea1": "Grade A",
    "gradeb1": "Grade B",
    "gradec1": "Grade C",
    "high": "High",
    "hint": "Select multiple options within a group to match any; different groups must all match. Combine with keywords and chapters.",
    "life": "Life",
    "littlemoney1": "Low cost",
    "littletime1": "Quick action",
    "mediumtime1": "A few hours",
    "money": "Money cost",
    "moneyresource1": "Money",
    "mucheffort1": "Substantial",
    "muchmoney1": "Higher cost",
    "muchtime1": "Daily commitment",
    "noeffort1": "None",
    "note": "Value tiers use the book’s cost and benefit tags and reflect the author’s judgment. Compare within the same resource category. Evidence is separate; disputed entries remain in their original grade.",
    "reset": "Clear all filters",
    "resource": "What you gain",
    "results": "Matching suggestions",
    "someeffort1": "Some",
    "standard": "Standard",
    "time": "Time needed",
    "timeresource1": "Time and energy",
    "title": "Filter suggestions",
    "value": "Value tier",
    "very_high": "Very high"
  },
  "ja": {
    "costs": "行動にかかる負担",
    "effort": "継続する手間",
    "empty": "一致するヒントがありません。条件を減らすか、別のキーワードをお試しください。",
    "evidence": "エビデンス",
    "free": "無料",
    "freedom": "身体の自由",
    "gradea1": "A",
    "gradeb1": "B",
    "gradec1": "C",
    "high": "高い",
    "hint": "同じグループ内はどれかに一致、グループ間はすべてに一致する条件で絞り込みます。検索や章の選択とも併用できます。",
    "life": "寿命",
    "littlemoney1": "少額",
    "littletime1": "短時間",
    "mediumtime1": "数時間",
    "money": "お金",
    "moneyresource1": "お金",
    "mucheffort1": "多い",
    "muchmoney1": "高額",
    "muchtime1": "日々の取り組み",
    "noeffort1": "なし",
    "note": "本の費用・効果タグと著者の判断に基づく区分です。同じ資源内で比較してください。根拠の強さは別に評価され、異論のある項目も原文の区分を保っています。",
    "reset": "条件をクリア",
    "resource": "得られるもの",
    "results": "該当するヒント",
    "someeffort1": "少し",
    "standard": "標準",
    "time": "所要時間",
    "timeresource1": "時間と気力",
    "title": "ヒントを絞り込む",
    "value": "コスパ",
    "very_high": "非常に高い"
  },
  "es": {
    "costs": "Costes de la acción",
    "effort": "Esfuerzo sostenido",
    "empty": "No hay consejos que coincidan. Quita un filtro o cambia la palabra clave.",
    "evidence": "Evidencia",
    "free": "Gratis",
    "freedom": "Libertad personal",
    "gradea1": "Nivel A",
    "gradeb1": "Nivel B",
    "gradec1": "Nivel C",
    "high": "Alto",
    "hint": "Dentro de cada grupo basta una opción; entre grupos deben cumplirse todas las condiciones. Combina con temas y palabras clave.",
    "life": "Vida",
    "littlemoney1": "Bajo coste",
    "littletime1": "Acción rápida",
    "mediumtime1": "Unas horas",
    "money": "Coste económico",
    "moneyresource1": "Dinero",
    "mucheffort1": "Considerable",
    "muchmoney1": "Mayor coste",
    "muchtime1": "Dedicación diaria",
    "noeffort1": "Ninguno",
    "note": "Los niveles usan las etiquetas del autor. Compara dentro del mismo recurso. La evidencia es independiente; los consejos discutidos conservan su nivel original.",
    "reset": "Borrar filtros",
    "resource": "Qué ganas",
    "results": "Consejos encontrados",
    "someeffort1": "Algo",
    "standard": "Normal",
    "time": "Tiempo necesario",
    "timeresource1": "Tiempo y energía",
    "title": "Filtrar consejos",
    "value": "Relación coste-beneficio",
    "very_high": "Muy alto"
  },
  "ru": {
    "costs": "Затраты на действие",
    "effort": "Постоянные усилия",
    "empty": "Советов не найдено. Уберите фильтр или измените слово.",
    "evidence": "Доказательность",
    "free": "Бесплатно",
    "freedom": "Личная свобода",
    "gradea1": "Уровень A",
    "gradeb1": "Уровень B",
    "gradec1": "Уровень C",
    "high": "Высокий",
    "hint": "Внутри группы подходит любой выбранный вариант; между группами должны совпасть все условия. Можно добавить тему и поисковое слово.",
    "life": "Жизнь",
    "littlemoney1": "Малые затраты",
    "littletime1": "Быстро",
    "mediumtime1": "Несколько часов",
    "money": "Деньги",
    "moneyresource1": "Деньги",
    "mucheffort1": "Значительные",
    "muchmoney1": "Большие затраты",
    "muchtime1": "Каждый день",
    "noeffort1": "Не нужны",
    "note": "Уровни основаны на авторских метках затрат и пользы. Сравнивайте в рамках одного ресурса. Доказательства оцениваются отдельно; спорные записи сохраняют исходный уровень.",
    "reset": "Сбросить фильтры",
    "resource": "Что получаете",
    "results": "Подходящие советы",
    "someeffort1": "Небольшие",
    "standard": "Обычный",
    "time": "Время",
    "timeresource1": "Время и силы",
    "title": "Фильтры советов",
    "value": "Уровень отдачи",
    "very_high": "Очень высокий"
  },
  "vi": {
    "costs": "Chi phí hành động",
    "effort": "Nỗ lực bền bỉ",
    "empty": "Không có gợi ý nào phù hợp với các điều kiện này. Loại bỏ một bộ lọc hoặc thử từ khóa khác.",
    "evidence": "Mức bằng chứng",
    "free": "Miễn phí",
    "freedom": "Tự do cá nhân",
    "gradea1": "Mức A",
    "gradeb1": "Mức B",
    "gradec1": "Mức C",
    "high": "Cao",
    "hint": "Chọn nhiều tùy chọn trong một nhóm để phù hợp với bất kỳ điều kiện nào; các nhóm khác phải đều phù hợp. Kết hợp với từ khóa và chương.",
    "life": "Cuộc sống",
    "littlemoney1": "Chi phí thấp",
    "littletime1": "Hành động nhanh",
    "mediumtime1": "Một vài giờ",
    "money": "Chi phí tiền bạc",
    "moneyresource1": "Tiền bạc",
    "mucheffort1": "Lớn",
    "muchmoney1": "Chi phí cao hơn",
    "muchtime1": "Cam kết hàng ngày",
    "noeffort1": "Không",
    "note": "Các mức giá trị sử dụng nhãn chi phí và lợi ích của cuốn sách và phản ánh phán đoán của tác giả. So sánh trong cùng một danh mục tài nguyên. Bằng chứng là riêng biệt; các mục có tranh cãi vẫn giữ nguyên mức bằng chứng ban đầu.",
    "reset": "Xóa tất cả bộ lọc",
    "resource": "Bạn sẽ nhận được gì",
    "results": "Gợi ý phù hợp",
    "someeffort1": "Một phần",
    "standard": "Tiêu chuẩn",
    "time": "Thời gian cần thiết",
    "timeresource1": "Thời gian và năng lượng",
    "title": "Lọc gợi ý",
    "value": "Mức giá trị",
    "very_high": "Rất cao"
  }
};
