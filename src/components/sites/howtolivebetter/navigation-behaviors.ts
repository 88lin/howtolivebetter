import navigation from "@/content/howtolivebetter/navigation.json";
import { sitePath } from "@/lib/site-path";

interface IconNode {
  tag: string;
  attributes: Record<string, string | undefined>;
  children: IconNode[];
}
type Language = keyof typeof navigation.more;
type Theme = "system" | "light" | "dark";
type MenuKind = "more" | "language" | "theme";

const icons: Record<string, IconNode> = navigation.icons;
const themes: Theme[] = ["system", "light", "dark"];

function sourceIcon(name: string): SVGElement {
  function build(node: IconNode): SVGElement {
    const element = document.createElementNS("http://www.w3.org/2000/svg", node.tag);
    Object.entries(node.attributes).forEach(([key, value]) => { if (value !== undefined) element.setAttribute(key, value); });
    node.children.forEach((child) => element.append(build(child)));
    return element;
  }
  return build(icons[name]);
}

function saved(key: string, fallback: string): string {
  try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
}

/** Source navigation states, using its original classes, labels and SVGs. */
export function installNavigation(root: HTMLElement, route: string, language: string): () => void {
  const lang: Language = language in navigation.more ? language as Language : "zh";
  const baseRoute = route.replace(/^\/(en|ru|es|ja|vi)(?=\/|$)/, "") || "/";
  const controller = new AbortController();
  const { signal } = controller;
  const header = root.querySelector<HTMLElement>(".life-header");
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  let theme = saved("how-better-theme", "system") as Theme;
  if (!themes.includes(theme)) theme = "system";
  let menu: HTMLDivElement | null = null;
  let trigger: HTMLButtonElement | null = null;
  let bottomMenu = false;
  let frame = 0;

  function closeMenu(restoreFocus = false) {
    menu?.remove();
    menu = null;
    if (trigger) {
      trigger.setAttribute("aria-expanded", "false");
      trigger.removeAttribute("aria-controls");
      if (restoreFocus) trigger.focus({ preventScroll: true });
    }
    trigger = null;
  }

  function positionMenu() {
    if (!menu || !trigger) return;
    const anchor = trigger.getBoundingClientRect();
    const available = bottomMenu ? anchor.top - 9 : window.innerHeight - anchor.bottom - 9;
    menu.style.maxHeight = `${Math.max(80, available)}px`;
    // The source animates the popup's scale; anchor against its layout size.
    const width = menu.offsetWidth;
    const height = menu.offsetHeight;
    menu.style.left = `${Math.max(5, Math.min(anchor.right - width, window.innerWidth - width - 5))}px`;
    menu.style.top = `${bottomMenu ? Math.max(5, anchor.top - height - 10) : anchor.bottom + 4}px`;
  }

  function applyTheme(choice: Theme, persist = true) {
    theme = choice;
    const dark = choice === "dark" || (choice === "system" && media.matches);
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
    root.querySelector(".life-theme-trigger")?.setAttribute("aria-label", navigation.themes[lang][themes.indexOf(choice)]);
    if (persist) { try { localStorage.setItem("how-better-theme", choice); } catch { /* Storage can be unavailable. */ } }
  }
  applyTheme(theme, false);
  media.addEventListener("change", () => { if (theme === "system") applyTheme("system", false); }, { signal });

  const sound = root.querySelector<HTMLButtonElement>(".life-sound-toggle");
  const enabledLabel = sound?.getAttribute("aria-label") || "关闭音效";
  const mutedLabels: Record<Language, string> = { zh: "开启音效", en: "Enable sound", ru: "Включить звук", es: "Activar sonido", ja: "サウンドを有効にする", vi: "Bật âm thanh" };
  function updateSound(muted: boolean) {
    if (sound) {
      sound.replaceChildren(sourceIcon(muted ? "sound-muted" : "sound-enabled"));
      sound.setAttribute("aria-pressed", String(!muted));
      sound.setAttribute("aria-label", muted ? mutedLabels[lang] : enabledLabel);
      sound.title = sound.getAttribute("aria-label")!;
    }
    root.querySelectorAll<HTMLMediaElement>("video,audio").forEach((element) => { element.muted = muted; });
  }
  updateSound(saved("how-better-muted", "false") === "true");

  function openMenu(button: HTMLButtonElement, kind: MenuKind, focusItem = false) {
    if (trigger === button) { closeMenu(); return; }
    closeMenu();
    trigger = button;
    bottomMenu = !!button.closest(".life-tabbar");
    button.setAttribute("aria-expanded", "true");
    menu = document.createElement("div");
    menu.className = `${navigation.classes[kind === "more" ? "more" : "theme"]} local-navigation-menu`;
    menu.id = `local-navigation-${kind}`;
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", button.getAttribute("aria-label") || button.textContent?.trim() || kind);
    menu.setAttribute("aria-orientation", "vertical");
    menu.setAttribute("data-side", bottomMenu ? "top" : "bottom");
    menu.setAttribute("data-open", "");
    menu.tabIndex = -1;
    button.setAttribute("aria-controls", menu.id);

    function item(label: string, href?: string, icon?: string, selected = false, action?: () => void) {
      const element = document.createElement(href ? "a" : "button");
      element.className = navigation.classes.item;
      element.setAttribute("role", "menuitem");
      element.tabIndex = -1;
      if (element instanceof HTMLAnchorElement) element.href = sitePath(href!);
      else { element.setAttribute("type", "button"); element.addEventListener("click", () => { action?.(); closeMenu(true); }, { signal }); }
      if (icon) element.append(sourceIcon(icon));
      if (selected) {
        if (kind === "more") element.classList.add("life-more-active");
        else element.append(sourceIcon("lucide-check"));
        if (href) element.setAttribute("aria-current", kind === "more" ? "page" : "true");
      }
      const text = document.createElement("span");
      text.textContent = label;
      element.append(text);
      element.addEventListener("pointermove", (event) => { if (event instanceof PointerEvent && event.pointerType === "mouse") element.focus({ preventScroll: true }); }, { signal });
      element.addEventListener("focus", () => element.setAttribute("data-highlighted", ""), { signal });
      element.addEventListener("blur", () => element.removeAttribute("data-highlighted"), { signal });
      menu!.append(element);
    }
    if (kind === "more") {
      navigation.more[lang].forEach(({ label, href, icon }) => item(label, href, icon, route === href || route.startsWith(`${href}/`)));
    } else if (kind === "language") {
      const tipLocales = root.querySelector("[data-tip-locales]")?.getAttribute("data-tip-locales")?.split(",");
      navigation.languages.forEach(({ code, label }) => {
        const missingTranslation = !!tipLocales && !tipLocales.includes(code) && /^\/tip\/\d{2}-\d{2}$/.test(baseRoute);
        const translatedRoute = missingTranslation ? `/book/${baseRoute.slice(5, 7)}` : baseRoute;
        const destination = `${code === "zh" ? "" : `/${code}`}${translatedRoute === "/" ? "" : translatedRoute}` || "/";
        item(label, destination + location.search + (missingTranslation ? "" : location.hash), undefined, code === lang);
      });
    } else {
      themes.forEach((choice, index) => item(navigation.themes[lang][index], undefined, ["lucide-monitor", "lucide-sun", "lucide-moon"][index], choice === theme, () => applyTheme(choice)));
    }
    document.body.append(menu);
    positionMenu();
    (focusItem ? menu.querySelector<HTMLElement>("[role=menuitem]") : menu)?.focus({ preventScroll: true });
  }

  function menuKind(button: HTMLButtonElement): MenuKind | null {
    if (button.matches(".life-nav-more, .life-tabbar button")) return "more";
    if (button.matches(".life-language-switch")) return "language";
    if (button.matches(".life-theme-trigger")) return "theme";
    return null;
  }
  root.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("button") : null;
    if (!button) return;
    const kind = menuKind(button);
    if (kind) { event.preventDefault(); openMenu(button, kind); }
    if (button === sound) {
      event.preventDefault();
      const muted = sound.getAttribute("aria-pressed") === "true";
      try { localStorage.setItem("how-better-muted", String(muted)); } catch { /* Keep in-memory state. */ }
      updateSound(muted);
    }
  }, { signal });
  root.addEventListener("keydown", (event) => {
    const button = event.target instanceof HTMLButtonElement ? event.target : null;
    if (button && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      const kind = menuKind(button);
      if (kind) {
        event.preventDefault(); event.stopPropagation(); openMenu(button, kind, true);
        if (event.key === "ArrowUp") menu?.querySelector<HTMLElement>("[role=menuitem]:last-child")?.focus();
      }
    }
  }, { signal });
  document.addEventListener("pointerdown", (event) => {
    if (menu && event.target instanceof Node && !menu.contains(event.target) && !trigger?.contains(event.target)) closeMenu();
  }, { signal });
  document.addEventListener("keydown", (event) => {
    if (!menu) return;
    if (event.key === "Escape") { event.preventDefault(); closeMenu(true); return; }
    if (event.key === "Tab") { closeMenu(true); return; }
    const items = Array.from(menu.querySelectorAll<HTMLElement>("[role=menuitem]"));
    const index = items.indexOf(document.activeElement as HTMLElement);
    const movement = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
    if (movement || event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + movement + items.length) % items.length;
      items[next]?.focus();
    } else if (event.key === " " && document.activeElement instanceof HTMLAnchorElement) {
      event.preventDefault(); document.activeElement.click();
    }
  }, { signal });

  function updateHeader() {
    header?.classList.toggle("is-scrolled", window.scrollY > 72);
    positionMenu();
  }
  window.addEventListener("scroll", () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(updateHeader);
  }, { signal, passive: true });
  window.addEventListener("resize", () => { closeMenu(); updateHeader(); }, { signal });
  header?.addEventListener("transitionend", positionMenu, { signal });
  updateHeader();
  return () => { controller.abort(); cancelAnimationFrame(frame); closeMenu(); };
}
