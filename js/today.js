import { fmtTime, fmtDate, refreshIcons, MONTHS } from "./ui.js?v=1792879063";

const PERSONAL_COLOR = "#FF7A90";
const DAYS_FULL = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

const $ = (id) => document.getElementById(id);
const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const toIso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addMin = (t, mins) => {
  const [h, m] = t.split(":").map(Number);
  const total = (h * 60 + m + mins) % 1440;
  return String(Math.floor(total / 60)).padStart(2, "0") + ":" + String(total % 60).padStart(2, "0");
};
const hoursOf = (min) => Math.round((min / 60) * 10) / 10;

function countHtml(secs) {
  secs = Math.max(0, secs);
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
  const parts = [];
  if (h) parts.push(h === 1 ? "<b>ساعة</b>" : h === 2 ? "<b>ساعتين</b>" : `<b>${h}</b> ساعات`);
  if (h || m) parts.push(`<b>${m}</b> دقيقة`);
  parts.push(`<b class="sec">${s}</b> ثانية`);
  return parts.join(" و ");
}

function colorOf(a, groups) {
  if (a.kind === "personal") return PERSONAL_COLOR;
  const g = groups.find((x) => x.id === a.groupId);
  return g ? g.color : "#B892FF";
}
function whoOf(a, groups) {
  if (a.kind === "personal") return "موعد خاص";
  if (a.groupId) { const g = groups.find((x) => x.id === a.groupId); return g ? g.name : "مجموعة محذوفة"; }
  return a.studentName || "طالب فردي";
}

let data = null, timer = null, ticker = null, inited = false, lastHtml = "", observer = null, onVis = null;

function skeleton() {
  const stat = `<div class="td-stat glass"><div class="sk sk-l" style="width:30px;height:20px;margin:0 auto 6px"></div><div class="sk sk-l" style="width:60%;margin:0 auto"></div></div>`;
  return `
    <div class="td-greet"><div class="sk sk-l" style="width:60%;height:22px"></div><div class="sk sk-l" style="width:35%;margin-top:10px"></div></div>
    <div class="td-hero glass">
      <div class="sk sk-pill"></div>
      <div class="sk sk-l" style="width:55%;height:20px;margin-top:14px"></div>
      <div class="sk sk-l" style="width:40%;margin-top:10px"></div>
      <div class="sk sk-l" style="width:50%;height:26px;margin-top:16px"></div>
    </div>
    <div class="td-stats">${stat}${stat}${stat}</div>`;
}

function build({ appts, groups }) {
  const now = new Date();
  const today = toIso(now);
  const h = now.getHours();
  const greet = h < 12 ? "صباح الخير" : h < 18 ? "نهارك سعيد" : "مساء الخير";

  const startOf = (a) => new Date(`${a.date}T${a.startTime}:00`);
  const endOf = (a) => new Date(startOf(a).getTime() + (a.durationMin || 0) * 60000);
  const byTime = (a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime);

  const all = [...appts].sort(byTime);
  const list = all.filter((a) => a.date === today);
  const live = list.find((a) => startOf(a) <= now && now < endOf(a));
  const next = all.find((a) => startOf(a) > now);

  /* ===== البطاقة الرئيسية ===== */
  let hero;
  if (live) {
    const secs = Math.ceil((endOf(live) - now) / 1000);
    const pct = Math.min(100, Math.max(0, ((now - startOf(live)) / (endOf(live) - startOf(live))) * 100));
    const who = whoOf(live, groups);
    hero = `
      <div class="td-hero live glass" style="--c:${colorOf(live, groups)}">
        <span class="td-label"><i class="live-dot"></i>جاري الآن</span>
        <h3>${esc(live.title)}</h3>
        <div class="td-sub">
          <span><i data-lucide="users"></i>${esc(who)}</span>
          <span><i data-lucide="clock"></i>${fmtTime(live.startTime)} – ${fmtTime(addMin(live.startTime, live.durationMin || 0))}</span>
          ${live.location ? `<span><i data-lucide="map-pin"></i>${esc(live.location)}</span>` : ""}
        </div>
        <div class="td-count" data-ts="${endOf(live).getTime()}" data-pre="ينتهي بعد ">ينتهي بعد ${countHtml(secs)}</div>
        <div class="td-bar" data-from="${startOf(live).getTime()}" data-to="${endOf(live).getTime()}"><i style="width:${pct.toFixed(1)}%"></i></div>
      </div>`;
  } else if (next) {
    const sameDay = next.date === today;
    const tomorrow = toIso(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
    const diff = Math.ceil((startOf(next) - now) / 1000);
    const when = sameDay ? "بعد " + countHtml(diff) : next.date === tomorrow ? "غداً" : fmtDate(next.date);
    const who = whoOf(next, groups);
    hero = `
      <div class="td-hero glass" style="--c:${colorOf(next, groups)}">
        <span class="td-label"><i data-lucide="hourglass"></i>الموعد الجاي</span>
        <h3>${esc(next.title)}</h3>
        <div class="td-sub">
          <span><i data-lucide="users"></i>${esc(who)}</span>
          <span><i data-lucide="clock"></i>${sameDay ? "" : fmtDate(next.date) + " · "}${fmtTime(next.startTime)} – ${fmtTime(addMin(next.startTime, next.durationMin || 0))}</span>
          ${next.location ? `<span><i data-lucide="map-pin"></i>${esc(next.location)}</span>` : ""}
        </div>
        <div class="td-count"${sameDay ? ` data-ts="${startOf(next).getTime()}" data-pre="بعد "` : ""}>${when}</div>
      </div>`;
  } else {
    hero = `
      <div class="td-hero glass">
        <span class="td-label"><i data-lucide="calendar-x"></i>الموعد الجاي</span>
        <h3>ما في مواعيد قادمة</h3>
        <div class="td-sub"><span>اضغط زر + لإضافة موعد جديد</span></div>
      </div>`;
  }

  /* ===== الأرقام ===== */
  const endWeek = toIso(new Date(now.getFullYear(), now.getMonth(), now.getDate() + (6 - now.getDay())));
  const weekLeft = all.filter((a) => a.date >= today && a.date <= endWeek).length;
  const todayMin = list.reduce((s, a) => s + (a.durationMin || 0), 0);
  const stats = `
    <div class="td-stats">
      <div class="td-stat glass"><b>${list.length}</b><span>دروس اليوم</span></div>
      <div class="td-stat glass"><b>${hoursOf(todayMin)}</b><span>ساعات اليوم</span></div>
      <div class="td-stat glass"><b>${weekLeft}</b><span>باقي هالأسبوع</span></div>
    </div>`;

  /* ===== تنبيه الإشعارات ===== */
  const nb = $("nav-badge");
  const n = nb && !nb.classList.contains("hidden") ? parseInt(nb.textContent, 10) || 0 : 0;
  const banner = n ? `
    <button type="button" class="td-notif" data-notif>
      <i data-lucide="bell-ring"></i>
      <span>عندك ${n} ${n === 1 ? "إشعار" : "إشعارات"} بخصوص مواعيد متكررة</span>
      <i data-lucide="chevron-left"></i>
    </button>` : "";

  /* ===== جدول اليوم ===== */
  const rows = list.map((a) => {
    const st = endOf(a) <= now ? "done" : live && a.id === live.id ? "now" : "";
    const who = whoOf(a, groups);
    return `
      <div class="td-row glass ${st}" style="--c:${colorOf(a, groups)}">
        <div class="td-t"><b>${fmtTime(a.startTime)}</b><small>${fmtTime(addMin(a.startTime, a.durationMin || 0))}</small></div>
        <div class="td-i"><strong>${esc(a.title)}</strong>${who ? `<span>${esc(who)}</span>` : ""}</div>
        <i data-lucide="${st === "done" ? "circle-check" : st === "now" ? "radio" : "clock"}" class="td-st"></i>
      </div>`;
  }).join("");

  const schedule = `
    <div class="td-sec"><i data-lucide="list-checks"></i>جدول اليوم</div>
    ${list.length ? rows : `<div class="td-free glass"><i data-lucide="coffee"></i><span>ما في مواعيد اليوم، استمتع بوقتك</span></div>`}`;

  return `
    <div class="td-greet">
      <h2>${greet} أستاذ محمود</h2>
      <p>${DAYS_FULL[now.getDay()]} ${now.getDate()} ${MONTHS[now.getMonth()]}</p>
    </div>
    ${hero}${stats}${banner}${schedule}`;
}

function draw() {
  const el = $("today-dash");
  if (!el) return;
  const html = data ? build(data) : skeleton();
  if (html === lastHtml) return;
  lastHtml = html;
  el.innerHTML = html;
  refreshIcons();
}

function tick() {
  if (document.hidden) return;
  const now = Date.now();
  let expired = false;
  document.querySelectorAll("#today-dash [data-ts]").forEach((el) => {
    const secs = Math.ceil((+el.dataset.ts - now) / 1000);
    if (secs <= 0) { expired = true; return; }
    el.innerHTML = el.dataset.pre + countHtml(secs);
  });
  document.querySelectorAll("#today-dash .td-bar[data-from]").forEach((b) => {
    const f = +b.dataset.from, t = +b.dataset.to;
    const pct = Math.min(100, Math.max(0, ((now - f) / (t - f)) * 100));
    if (b.firstElementChild) b.firstElementChild.style.width = pct.toFixed(1) + "%";
  });
  if (expired) draw();
}

function init() {
  if (inited) return;
  inited = true;
  const el = $("today-dash");
  if (el) el.onclick = (e) => { if (e.target.closest("[data-notif]")) location.hash = "notifications"; };
  timer = setInterval(() => { if (!document.hidden) draw(); }, 30000);
  ticker = setInterval(tick, 1000);
  onVis = () => { if (!document.hidden) draw(); };
  document.addEventListener("visibilitychange", onVis);
  const nb = $("nav-badge");
  if (nb) {
    observer = new MutationObserver(() => draw());
    observer.observe(nb, { attributes: true, childList: true, characterData: true, subtree: true });
  }
}

export function renderToday(d) {
  init();
  data = d;
  draw();
}

export function stopToday() {
  if (timer) clearInterval(timer);
  if (ticker) clearInterval(ticker);
  if (observer) observer.disconnect();
  if (onVis) document.removeEventListener("visibilitychange", onVis);
  timer = ticker = observer = onVis = null;
  inited = false; data = null; lastHtml = "";
}
