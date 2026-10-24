import { db } from "./firebase-config.js?v=1792876052";
import {
  collection, onSnapshot, query, orderBy, where
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { state, refreshIcons, dialog, fmtDate, fmtTime, MONTHS } from "./ui.js?v=1792876052";
import { onEdit, onDelete } from "./appointments.js?v=1792876052";

const WEEK_START = 0;          // 0 = الأحد ، 6 = السبت
const HOUR_H = 64;             // ارتفاع الساعة بالبكسل
const PERSONAL_COLOR = "#FF7A90";
const DAY_NAMES = ["أحد", "اثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];

const $ = (id) => document.getElementById(id);
const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let started = false, unsubA = null, unsubG = null, weekKey = null;
let groups = [], weekAppts = [], selDay = null;

const toIso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parseIso = (s) => new Date(s + "T00:00:00");
const todayStr = () => toIso(new Date());
const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const minToTime = (m) => {
  m = m % 1440;
  return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
};
const hourLabel = (h) => `${(h % 24) % 12 || 12} ${(h % 24) >= 12 ? "م" : "ص"}`;

function weekStartOf(iso) {
  const d = parseIso(iso);
  d.setDate(d.getDate() - ((d.getDay() - WEEK_START + 7) % 7));
  return d;
}

function colorOf(a) {
  if (a.kind === "personal") return PERSONAL_COLOR;
  const g = groups.find((x) => x.id === a.groupId);
  return g ? g.color : "#B892FF";
}
function whoOf(a) {
  if (a.kind === "personal") return "موعد خاص";
  if (a.groupId) { const g = groups.find((x) => x.id === a.groupId); return g ? g.name : "مجموعة محذوفة"; }
  return a.studentName || "طالب فردي";
}

/* ===== بناء جدول اليوم ===== */
function buildTimeline(items, isToday) {
  const ev = items.map((a) => {
    const s = toMin(a.startTime);
    return { a, s, e: Math.min(s + a.durationMin, 1440) };
  }).sort((x, y) => x.s - y.s || x.e - y.e);

  // توزيع المواعيد المتداخلة على أعمدة
  let cluster = [], colEnds = [], clusterEnd = 0;
  const flush = () => {
    const cols = colEnds.length;
    cluster.forEach((c) => (c.cols = cols));
    cluster = []; colEnds = []; clusterEnd = 0;
  };
  for (const x of ev) {
    if (cluster.length && x.s >= clusterEnd) flush();
    let col = colEnds.findIndex((en) => en <= x.s);
    if (col === -1) { col = colEnds.length; colEnds.push(x.e); } else colEnds[col] = x.e;
    x.col = col;
    cluster.push(x);
    clusterEnd = Math.max(clusterEnd, x.e);
  }
  if (cluster.length) flush();

  const startH = Math.min(8, Math.floor(Math.min(...ev.map((x) => x.s)) / 60));
  const endH = Math.min(24, Math.max(22, Math.ceil(Math.max(...ev.map((x) => x.e)) / 60)));
  const total = (endH - startH) * HOUR_H;

  let html = `<div class="tl-inner" style="height:${total}px">`;
  for (let h = startH; h <= endH; h++) {
    html += `<div class="tl-hour" style="top:${(h - startH) * HOUR_H}px"><span>${hourLabel(h)}</span></div>`;
  }
  html += `<div class="tl-events">`;
  for (const x of ev) {
    const top = (x.s - startH * 60) * HOUR_H / 60;
    const height = Math.max((x.e - x.s) * HOUR_H / 60, 28) - 2;
    html += `
      <div class="tl-event ${height < 52 ? "short" : ""}" data-id="${x.a.id}"
        style="top:${top}px;height:${height}px;right:${(x.col / x.cols * 100).toFixed(2)}%;width:calc(${(100 / x.cols).toFixed(2)}% - 4px);--c:${colorOf(x.a)}">
        <b>${esc(x.a.title)}</b>
        <small>${fmtTime(x.a.startTime)} – ${fmtTime(minToTime(x.e))}</small>
        <small>${esc(whoOf(x.a))}</small>
      </div>`;
  }
  html += `</div>`;

  if (isToday) {
    const n = new Date(), nm = n.getHours() * 60 + n.getMinutes();
    if (nm >= startH * 60 && nm <= endH * 60) {
      html += `<div class="now-line" style="top:${(nm - startH * 60) * HOUR_H / 60}px"></div>`;
    }
  }
  return html + `</div>`;
}

/* ===== العرض ===== */
function render() {
  if (!selDay) return;
  state.calDate = selDay;

  const start = weekStartOf(selDay);
  const days = [...Array(7)].map((_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return d; });
  const end = days[6], today = todayStr();

  const sm = start.getMonth(), em = end.getMonth();
  $("cal-range").textContent = sm === em
    ? `${start.getDate()} – ${end.getDate()} ${MONTHS[em]} ${end.getFullYear()}`
    : `${start.getDate()} ${MONTHS[sm]} – ${end.getDate()} ${MONTHS[em]} ${end.getFullYear()}`;

  $("cal-strip").innerHTML = days.map((d) => {
    const iso = toIso(d);
    const colors = [...new Set(weekAppts.filter((a) => a.date === iso).map(colorOf))].slice(0, 3);
    return `<button type="button" class="wd ${iso === selDay ? "sel" : ""} ${iso === today ? "today" : ""}" data-d="${iso}">
      <small>${DAY_NAMES[d.getDay()]}</small><b>${d.getDate()}</b>
      <span class="dots">${colors.map((c) => `<i class="dot sm" style="background:${c}"></i>`).join("")}</span>
    </button>`;
  }).join("");

  const items = weekAppts.filter((a) => a.date === selDay);
  $("cal-day-title").textContent =
    `${fmtDate(selDay)}${selDay === today ? " · اليوم" : ""}${items.length ? ` · ${items.length} ${items.length > 2 ? "مواعيد" : items.length === 2 ? "موعدان" : "موعد"}` : ""}`;

  $("cal-empty").classList.toggle("hidden", items.length > 0);
  $("cal-timeline").classList.toggle("hidden", items.length === 0);
  $("cal-timeline").innerHTML = items.length ? buildTimeline(items, selDay === today) : "";
  refreshIcons();
}

function scrollToFirst() {
  setTimeout(() => {
    const el = document.querySelector("#cal-timeline .tl-event") || document.querySelector("#cal-timeline .now-line");
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 170, behavior: "smooth" });
  }, 60);
}

/* ===== جلب مواعيد الأسبوع ===== */
function loadWeek() {
  const start = weekStartOf(selDay);
  const key = toIso(start);
  if (key === weekKey) return;
  weekKey = key;
  weekAppts = [];
  if (unsubA) unsubA();
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  unsubA = onSnapshot(
    query(collection(db, "appointments"), where("date", ">=", key), where("date", "<=", toIso(end))),
    (snap) => {
      weekAppts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      render();
    },
    (err) => console.error("calendar:", err)
  );
}

function pick(iso) { selDay = iso; loadWeek(); render(); scrollToFirst(); }
function shiftWeek(n) {
  const d = parseIso(selDay);
  d.setDate(d.getDate() + n);
  selDay = toIso(d);
  loadWeek();
  render();
}

/* ===== التشغيل ===== */
export function initCalendar() {
  if (started) return;
  started = true;
  selDay = todayStr();

  $("cal-prev").onclick = () => shiftWeek(-7);
  $("cal-next").onclick = () => shiftWeek(7);
  $("cal-today").onclick = () => pick(todayStr());
  $("cal-strip").onclick = (e) => {
    const b = e.target.closest("[data-d]");
    if (b) pick(b.dataset.d);
  };

  $("cal-timeline").onclick = async (e) => {
    const el = e.target.closest(".tl-event");
    if (!el) return;
    const a = weekAppts.find((x) => x.id === el.dataset.id);
    if (!a) return;
    const end = minToTime(Math.min(toMin(a.startTime) + a.durationMin, 1440));
    const lines = [fmtDate(a.date), `${fmtTime(a.startTime)} – ${fmtTime(end)}`, whoOf(a)];
    if (a.location) lines.push("المكان: " + a.location);
    if (a.notes) lines.push("ملاحظات: " + a.notes);
    const r = await dialog({
      icon: a.kind === "personal" ? "user-round" : a.groupId ? "users" : "user",
      title: a.title,
      text: lines.join("\n"),
      buttons: [
        { label: "تعديل", value: "edit" },
        { label: "حذف", value: "del", danger: true },
        { label: "إغلاق", value: null, ghost: true }
      ]
    });
    if (r === "edit") onEdit(a, "calendar");
    else if (r === "del") onDelete(a);
  };

  unsubG = onSnapshot(
    query(collection(db, "groups"), orderBy("createdAt")),
    (snap) => { groups = snap.docs.map((d) => ({ id: d.id, ...d.data() })); render(); },
    (err) => console.error("groups:", err)
  );

  loadWeek();
  render();
}

export function stopCalendar() {
  if (unsubA) unsubA();
  if (unsubG) unsubG();
  unsubA = unsubG = null;
  weekKey = null;
  state.calDate = null;
  started = false;
}
