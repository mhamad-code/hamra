import { db } from "./firebase-config.js?v=1792878025";
import {
  collection, getDocs, orderBy, query
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { dialog, toast, fmtDate, fmtTime, MONTHS, refreshIcons } from "./ui.js?v=1792878025";

const PERSONAL_COLOR = "#FF7A90";
const DAYS_FULL = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

const $ = (id) => document.getElementById(id);
const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ic = (n) => `<i data-lucide="${n}"></i>`;

const toIso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const todayStr = () => toIso(new Date());
const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const minToTime = (m) => {
  m = m % 1440;
  return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
};
const durText = (m) => {
  const h = Math.floor(m / 60), r = m % 60, p = [];
  if (h === 1) p.push("ساعة"); else if (h === 2) p.push("ساعتان"); else if (h > 2) p.push(`${h} ساعات`);
  if (r) p.push(`${r} دقيقة`);
  return p.join(" و ");
};
const hoursOf = (min) => Math.round(min / 60 * 10) / 10;

function buildHtml(list, groups, scope) {
  const today = todayStr();

  const colorOf = (a) => {
    if (a.kind === "personal") return PERSONAL_COLOR;
    const g = groups.find((x) => x.id === a.groupId);
    return g ? g.color : "#B892FF";
  };
  const whoOf = (a) => {
    if (a.kind === "personal") return "";
    if (a.groupId) { const g = groups.find((x) => x.id === a.groupId); return g ? g.name : "مجموعة محذوفة"; }
    return a.studentName || "طالب فردي";
  };
  const typeOf = (a) =>
    a.kind === "personal" ? { label: "موعد خاص", icon: "user-round" }
    : a.groupId ? { label: "درس مجموعة", icon: "users" }
    : { label: "درس فردي", icon: "user" };

  /* ===== الإحصائيات ===== */
  const total = list.length;
  const grpN = list.filter((a) => a.kind !== "personal" && a.groupId).length;
  const indN = list.filter((a) => a.kind !== "personal" && !a.groupId).length;
  const perN = list.filter((a) => a.kind === "personal").length;
  const mins = list.reduce((s, a) => s + (a.durationMin || 0), 0);

  const stats = [
    { icon: "calendar-days", num: total, label: "إجمالي المواعيد", c: "#FFB23E" },
    { icon: "users", num: grpN, label: "دروس المجموعات", c: "#B892FF" },
    { icon: "user", num: indN, label: "دروس فردية", c: "#5EEAD4" },
    { icon: "user-round", num: perN, label: "مواعيد خاصة", c: "#FF7A90" },
    { icon: "layers", num: groups.length, label: "عدد المجموعات", c: "#6EA8FF" },
    { icon: "clock", num: hoursOf(mins), label: "إجمالي الساعات", c: "#A3E635" }
  ].map((s) => `
    <div class="pr-stat">
      <div class="pr-stat-ic" style="--c:${s.c}">${ic(s.icon)}</div>
      <div><b>${s.num}</b><span>${s.label}</span></div>
    </div>`).join("");

  /* ===== ملخص المجموعات ===== */
  const groupRows = groups.map((g) => {
    const items = list.filter((a) => a.groupId === g.id);
    return { g, n: items.length, h: hoursOf(items.reduce((s, a) => s + (a.durationMin || 0), 0)) };
  }).filter((x) => x.n > 0);

  const groupsHtml = groupRows.length ? `
    <h2 class="pr-h">${ic("users")}المجموعات</h2>
    <div class="pr-groups">
      ${groupRows.map((x) => `
        <div class="pr-g" style="--c:${x.g.color}">
          <i class="pr-dot"></i>
          <strong>${esc(x.g.name)}</strong>
          <span>${x.n} موعد · ${x.h} ساعة</span>
        </div>`).join("")}
    </div>` : "";

  /* ===== المواعيد حسب الشهر واليوم ===== */
  const itemHtml = (a) => {
    const t = typeOf(a), color = colorOf(a), who = whoOf(a);
    const end = minToTime(toMin(a.startTime) + a.durationMin);
    const past = a.date < today;
    return `
      <div class="pr-item ${past ? "past" : ""}" style="--c:${color}">
        <div class="pr-time"><b>${fmtTime(a.startTime)}</b><span>${fmtTime(end)}</span><em>${durText(a.durationMin)}</em></div>
        <div class="pr-body">
          <div class="pr-line">
            <span class="pr-tag">${ic(t.icon)}${t.label}</span>
            ${a.seriesId ? `<span class="pr-rep">${ic("repeat")}متكرر</span>` : ""}
            ${past ? `<span class="pr-done">منتهي</span>` : ""}
          </div>
          <strong>${esc(a.title)}</strong>
          <div class="pr-meta">
            ${who ? `<span><i class="pr-dot"></i>${esc(who)}</span>` : ""}
            ${a.location ? `<span>${ic("map-pin")}${esc(a.location)}</span>` : ""}
            ${a.notes ? `<span>${ic("sticky-note")}${esc(a.notes)}</span>` : ""}
          </div>
        </div>
      </div>`;
  };

  const byMonth = {};
  list.forEach((a) => ((byMonth[a.date.slice(0, 7)] ||= {})[a.date] ||= []).push(a));

  let months = "";
  for (const mk of Object.keys(byMonth).sort()) {
    const [y, m] = mk.split("-").map(Number);
    const days = byMonth[mk];
    const count = Object.values(days).reduce((s, x) => s + x.length, 0);
    months += `<section class="pr-month"><div class="pr-mh"><b>${MONTHS[m - 1]} ${y}</b><span>${count} موعد</span></div>`;
    for (const ds of Object.keys(days).sort()) {
      const d = new Date(ds + "T00:00:00");
      months += `
        <div class="pr-day">
          <div class="pr-date ${ds === today ? "today" : ""}"><b>${d.getDate()}</b><span>${DAYS_FULL[d.getDay()]}</span></div>
          <div class="pr-items">${days[ds].map(itemHtml).join("")}</div>
        </div>`;
    }
    months += `</section>`;
  }

  const now = new Date();
  const genDate = `${DAYS_FULL[now.getDay()]} ${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`;

  return `
    <header class="pr-hero">
      <div class="pr-hero-in">
        <div class="pr-logo">${ic("calendar-check")}</div>
        <div class="pr-hero-txt">
          <div class="pr-eyebrow">جدول المواعيد</div>
          <h1 class="pr-title">الأستاذ محمود حديري</h1>
          <div class="pr-sub">من ${fmtDate(list[0].date)} إلى ${fmtDate(list[list.length - 1].date)}</div>
          <div class="pr-chips">
            <span class="pr-chip">${ic("file-text")}${scope === "upcoming" ? "المواعيد القادمة فقط" : "كل المواعيد"}</span>
            <span class="pr-chip">${ic("calendar-clock")}تاريخ التصدير: ${genDate}</span>
          </div>
        </div>
      </div>
    </header>

    <section class="pr-stats">${stats}</section>
    ${groupsHtml}
    <h2 class="pr-h">${ic("calendar-days")}المواعيد</h2>
    ${months}
    <p class="pr-end">تم إنشاء هذا الملف من موقع الأستاذ محمود حديري · ${genDate}</p>`;
}

export async function exportPdf() {
  const choice = await dialog({
    icon: "file-down", title: "تصدير المواعيد PDF",
    text: "اختر نطاق التصدير. بعدها بتفتح نافذة الطباعة، اختر منها «حفظ بصيغة PDF».",
    buttons: [
      { label: "كل المواعيد (الماضية والقادمة)", value: "all" },
      { label: "المواعيد القادمة فقط", value: "upcoming" },
      { label: "إلغاء", value: null, ghost: true }
    ]
  });
  if (!choice) return;

  const btn = $("export-btn");
  btn.disabled = true;
  try {
    const [aSnap, gSnap] = await Promise.all([
      getDocs(query(collection(db, "appointments"), orderBy("date"))),
      getDocs(query(collection(db, "groups"), orderBy("createdAt")))
    ]);
    const groups = gSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    let list = aSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
    if (choice === "upcoming") list = list.filter((a) => a.date >= todayStr());
    if (!list.length) return toast("ما في مواعيد لتصديرها", "warn");

    $("print-root")?.remove();
    const root = document.createElement("div");
    root.id = "print-root";
    root.innerHTML = buildHtml(list, groups, choice);
    document.body.appendChild(root);
    refreshIcons();

    const oldTitle = document.title;
    document.title = `جدول مواعيد - الأستاذ محمود حديري - ${todayStr()}`;
    const done = () => {
      root.remove();
      document.title = oldTitle;
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);

    toast("اختر «حفظ بصيغة PDF» من نافذة الطباعة", "ok");
    await new Promise((r) => setTimeout(r, 450));
    window.print();
  } catch (err) {
    console.error(err);
    toast("تعذّر تجهيز الملف", "error");
  } finally {
    btn.disabled = false;
  }
}

let started = false;
export function initExport() {
  if (started) return;
  started = true;
  $("export-btn").onclick = exportPdf;
}
