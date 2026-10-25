import { refreshIcons } from "./ui.js?v=1792924831";

const KEY = "tm_theme";
const mq = matchMedia("(prefers-color-scheme: dark)");
const $ = (id) => document.getElementById(id);
const saved = () => { try { return localStorage.getItem(KEY); } catch (e) { return null; } };
const current = () => saved() || (mq.matches ? "dark" : "light");

function apply() {
  const t = current();
  document.documentElement.setAttribute("data-theme", t);
  const m = document.querySelector("meta[name=theme-color]");
  if (m) m.setAttribute("content", t === "dark" ? "#1B1230" : "#B892FF");
  const btn = $("theme-btn");
  if (btn) {
    btn.innerHTML = `<i data-lucide="${t === "dark" ? "sun" : "moon"}"></i>`;
    btn.setAttribute("aria-label", t === "dark" ? "الوضع الفاتح" : "الوضع الداكن");
    refreshIcons();
  }
}

export function initTheme() {
  apply();
  const btn = $("theme-btn");
  if (btn) btn.onclick = () => {
    const next = current() === "dark" ? "light" : "dark";
    try { localStorage.setItem(KEY, next); } catch (e) {}
    apply();
  };
  mq.addEventListener("change", () => { if (!saved()) apply(); });
}
