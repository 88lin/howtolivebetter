"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { installNavigation } from "./navigation-behaviors";
import { isStaticPreview, sitePath } from "@/lib/site-path";

export function SiteRuntime({ children, route, lang }: { children: ReactNode; route: string; lang: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    document.documentElement.lang = lang;
    const controller = new AbortController();
    const { signal } = controller;
    const cleanup: Array<() => void> = [];
    let active = true;
    const dialogs = new Set<HTMLDialogElement>();
    const isChinese = lang === "zh";
    cleanup.push(installNavigation(root, route, lang));

    function toast(text: string) {
      document.querySelector(".local-toast")?.remove();
      const el = document.createElement("div");
      el.className = "local-toast"; el.setAttribute("role", "status"); el.textContent = text;
      document.body.append(el);
      const id = setTimeout(() => el.remove(), 3500);
      cleanup.push(() => { clearTimeout(id); el.remove(); });
    }
    function dialog(title: string, text: string) {
      const el = document.createElement("dialog"); el.className = "local-dialog";
      const close = document.createElement("button"); close.className = "local-close"; close.textContent = "×";
      close.setAttribute("aria-label", isChinese ? "关闭" : "Close"); close.onclick = () => el.close();
      const heading = document.createElement("h2"); heading.textContent = title;
      const paragraph = document.createElement("p"); paragraph.textContent = text;
      el.append(close, heading, paragraph); document.body.append(el); dialogs.add(el);
      el.addEventListener("close", () => { el.remove(); dialogs.delete(el); });
      el.addEventListener("click", (event) => { if (event.target === el) { const rect = el.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) el.close(); } });
      el.showModal(); return el;
    }

    const cards = Array.from(root.querySelectorAll<HTMLElement>(".life-hero-advice"));
    const chapterArt: Record<string, string> = { "01": "01-safety-editorial", "03": "03-energy-editorial", "04": "04-time-screenprint", "05": "05-money-collage", "14": "14-account-security-editorial" };
    cards.forEach((card) => {
      const img = card.querySelector("img");
      const chapter = card.querySelector("a")?.getAttribute("href")?.match(/book\/(\d+)/)?.[1];
      if (img && !img.getAttribute("src") && chapter && chapterArt[chapter]) img.src = sitePath(`/sites/howtolivebetter/images/book-chapters/${chapterArt[chapter]}.webp`);
    });
    let slide = 0;
    let carouselInteracted = false;
    let carouselHovered = false;
    let carouselVisible = false;
    function showSlide(index: number) {
      slide = (index + cards.length) % cards.length;
      cards.forEach((card, i) => { card.classList.toggle("is-active", i === slide); card.setAttribute("aria-hidden", String(i !== slide)); card.querySelector("a")?.setAttribute("tabindex", i === slide ? "0" : "-1"); });
      root!.querySelectorAll(".life-hero-carousel-dots button").forEach((b, i) => { if (i === slide) b.setAttribute("aria-current", "true"); else b.removeAttribute("aria-current"); });
      const caption = root!.querySelector(".life-hero-carousel-caption span:last-child");
      if (caption) caption.textContent = `${String(slide + 1).padStart(2, "0")} / ${String(cards.length).padStart(2, "0")}`;
    }
    if (cards.length) showSlide(0);
    const carousel = root.querySelector<HTMLElement>(".life-hero-carousel");
    if (carousel) {
      const observer = new IntersectionObserver(([entry]) => { carouselVisible = entry.isIntersecting; }, { threshold: 0.15 });
      observer.observe(carousel); cleanup.push(() => observer.disconnect());
      carousel.addEventListener("mouseenter", () => { carouselHovered = true; }, { signal });
      carousel.addEventListener("mouseleave", () => { carouselHovered = false; }, { signal });
      carousel.addEventListener("focusin", () => { carouselInteracted = true; }, { signal });
      carousel.addEventListener("keydown", (event) => { if (["ArrowLeft", "ArrowRight"].includes(event.key)) { event.preventDefault(); carouselInteracted = true; showSlide(slide + (event.key === "ArrowLeft" ? -1 : 1)); } }, { signal });
      let touch: { x: number; y: number } | undefined;
      carousel.addEventListener("touchstart", (event) => { touch = { x: event.touches[0].clientX, y: event.touches[0].clientY }; }, { signal, passive: true });
      carousel.addEventListener("touchend", (event) => { if (!touch) return; const dx = event.changedTouches[0].clientX - touch.x; const dy = event.changedTouches[0].clientY - touch.y; if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) { carouselInteracted = true; showSlide(slide + (dx > 0 ? -1 : 1)); } touch = undefined; }, { signal });
      const timer = setInterval(() => { if (carouselVisible && !carouselHovered && !carouselInteracted && !document.hidden && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) showSlide(slide + 1); }, 7000);
      cleanup.push(() => clearInterval(timer));
    }

    root.querySelectorAll<HTMLVideoElement>("video").forEach((video) => {
      const intro = video.matches(".life-intro-video-player");
      video.controls = !intro;
      video.preload = intro ? "none" : "metadata";
      if (intro) video.poster = sitePath(`/sites/howtolivebetter/videos/home-intro-${lang === "vi" ? "en" : lang}.webp`);
      const overlay = video.parentElement?.querySelector<HTMLElement>(".life-intro-video-play");
      video.addEventListener("play", () => { video.controls = true; if (overlay) overlay.hidden = true; }, { signal });
    });

    const click = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      const target = event.target instanceof Element ? event.target : null;
      const button = target?.closest<HTMLButtonElement>("button");
      if (!button || !root.contains(button)) return;
      if (button.closest(".life-hero-carousel-controls")) {
        carouselInteracted = true;
        const dots = Array.from(root.querySelectorAll(".life-hero-carousel-dots button"));
        const index = dots.indexOf(button);
        if (index >= 0) showSlide(index);
        else showSlide(slide + (button === root.querySelector(".life-hero-carousel-controls > button") ? -1 : 1));
      } else if (button.matches(".life-intro-video-play")) {
        const video = button.parentElement?.querySelector("video");
        if (video) void video.play().catch(() => toast(isChinese ? "视频暂时无法播放，请稍后重试。" : "Unable to play the video."));
      } else if (button.matches(".social-share-trigger") && !button.closest(".life-entry-card, .top50-item")) {
        const el = dialog(isChinese ? "把好建议分享给朋友" : "Share with a friend", document.title);
        const field = document.createElement("input"); field.readOnly = true; field.value = location.href;
        const copy = document.createElement("button"); copy.textContent = isChinese ? "复制链接" : "Copy link";
        copy.onclick = () => { void navigator.clipboard.writeText(location.href).then(() => toast(isChinese ? "链接已复制" : "Link copied")); };
        el.append(field, copy);
      } else if (button.matches(".life-community-join")) {
        const el = dialog(isChinese ? "加入社群" : "Join the community", isChinese ? "社群由原站维护，可前往原站查看最新的加入方式。" : "The community is maintained by the original website.");
        const a = document.createElement("a"); a.className = "local-action"; a.textContent = isChinese ? "查看原站社群" : "Visit the original website"; a.href = "https://howtolivebetter.net/contact"; a.target = "_blank"; a.rel = "noopener noreferrer"; el.append(a);
      } else if (button.matches(".privacy-settings-button")) {
        const privacy = isStaticPreview
          ? (isChinese ? "此预览不加载原站广告追踪或统计脚本。清单、任务与练习记录保存在此浏览器。" : "This preview does not load the source website's analytics or advertising trackers. Progress is saved in this browser.")
          : (isChinese ? "本地版本不加载原站广告追踪或统计脚本。清单、任务与练习记录保存在此浏览器；登录本地账号后可同步到当前服务器。" : "This local edition does not load the source website's analytics or advertising trackers. Your progress is saved in this browser, with optional sync to this server.");
        const el = dialog(isChinese ? "隐私设置" : "Privacy settings", privacy);
        const ok = document.createElement("button"); ok.textContent = isChinese ? "知道了" : "Got it"; ok.onclick = () => el.close(); el.append(ok);
      } else if (button.closest(".life-quick-share, .social-share-platforms") || button.matches(".sc-secondary-button")) {
        const text = `${document.title}\n${location.href}`;
        if (navigator.share && button.closest(".social-share-platforms")) void navigator.share({ title: document.title, url: location.href }).catch(() => undefined);
        else void navigator.clipboard.writeText(text).then(() => toast(isChinese ? "文案与链接已复制，可粘贴分享。" : "Title and link copied."));
      } else if (button.closest(".jd-categories")) {
        const buttons = Array.from(root.querySelectorAll(".jd-categories button"));
        buttons.forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
        const category = button.textContent?.trim() || "";
        root.querySelectorAll<HTMLElement>(".jd-product").forEach((item) => { item.hidden = buttons.indexOf(button) !== 0 && !item.textContent?.includes(category); });
      } else if (button.closest(".sc-story-filters")) {
        const buttons = Array.from(root.querySelectorAll(".sc-story-filters button"));
        const type = ["", "voices", "projects", "guides"][buttons.indexOf(button)];
        buttons.forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
        root.querySelectorAll<HTMLElement>(".sc-story").forEach((item) => { item.hidden = !!type && !item.classList.contains(`sc-story-${type}`); });
      } else if (button.closest(".sc-story-arrows")) {
        const strip = root.querySelector<HTMLElement>(".sc-stories-rail");
        strip?.scrollBy({ left: (button === button.parentElement?.firstElementChild ? -1 : 1) * strip.clientWidth, behavior: "smooth" });
      } else if (button.closest(".sc-path-choices")) {
        button.parentElement?.querySelectorAll("button").forEach((b) => { b.classList.toggle("is-selected", b === button); b.setAttribute("aria-pressed", String(b === button)); });
        const target = root.querySelector<HTMLElement>(".sc-trial-copy > p");
        if (target) target.textContent = button.textContent;
      }
    };
    root.addEventListener("click", click, { signal });
    Promise.all([
      import("./reader-behaviors").then((m) => m.installReaderBehaviors),
      import("./tool-behaviors").then((m) => m.installToolBehaviors),
      import("./service-behaviors").then((m) => m.installServiceBehaviors),
    ]).then((installers) => { if (active) installers.forEach((install) => cleanup.push(install(root, route))); }).catch((error: unknown) => { console.error("Unable to start local page controls", error); });
    return () => { active = false; controller.abort(); dialogs.forEach((d) => d.remove()); cleanup.forEach((fn) => fn()); };
  }, [route, lang]);
  return <div ref={ref} style={{ display: "contents" }}>{children}</div>;
}
