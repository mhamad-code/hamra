const $ = (id) => document.getElementById(id);

export const MONTHS = ["كانون الثاني","شباط","آذار","نيسان","أيار","حزيران","تموز","آب","أيلول","تشرين الأول","تشرين الثاني","كانون الأول"];
const DAYS_FULL = ["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"];
const DAYS_SHORT = ["ح","ن","ث","ر","خ","ج","س"];

export const refreshIcons = () => window.lucide && window.lucide.createIcons();

export function fmtDate(s) {
  const d = new Date(s + "T00:00:00");
  return `${DAYS_FULL[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
export function fmtTime(t) {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "م" : "ص"}`;
}

/* ===== التنقل بين الصفحات ===== */
export const state = { groupId: null };
const PAGES = ["notifications", "calendar", "appointments", "groups", "group", "new-appointment", "new-group"];
const NAV_PAGES = ["notifications", "calendar", "appointments", "groups", "group"];

function showPage(name) {
  if (!PAGES.includes(name)) name = "appointments";
  if (name === "group" && !state.groupId) name = "groups";
  PAGES.forEach((p) => $("page-" + p).classList.toggle("hidden", p !== name));
  $("bottom-nav").classList.toggle("hidden", !NAV_PAGES.includes(name));
  document.querySelectorAll("#bottom-nav [data-go]").forEach((b) =>
    b.classList.toggle("on", b.dataset.go === (name === "group" ? "groups" : name)));
  window.scrollTo(0, 0);
}

export function go(name) {
  if (location.hash !== "#" + name) location.hash = name;
  else showPage(name);
}

let routerOn = false;
export function initRouter() {
  if (routerOn) return;
  routerOn = true;
  window.addEventListener("hashchange", () => showPage(location.hash.slice(1)));
  document.querySelectorAll("#bottom-nav [data-go]").forEach((b) =>
    (b.onclick = () => go(b.dataset.go)));
  showPage(location.hash.slice(1));
}

/* ===== النافذة السفلية ===== */
export function openSheet(setup) {
  return new Promise((resolve) => {
    const sheet = $("sheet");
    const finish = (v) => {
      sheet.classList.remove("show");
      setTimeout(() => { if (!sheet.classList.contains("show")) sheet.classList.add("hidden"); }, 260);
      resolve(v);
    };
    $("sheet-bg").onclick = () => finish(null);
    sheet.classList.remove("hidden");
    setup(finish);
    requestAnimationFrame(() => requestAnimationFrame(() => sheet.classList.add("show")));
  });
}

/* ===== التقويم ===== */
export function pickDate(current) {
  return openSheet((finish) => {
    const now = new Date();
    const base = current ? new Date(current + "T00:00:00") : now;
    let y = base.getFullYear(), m = base.getMonth();
    const iso = (yy, mm, dd) => `${yy}-${String(mm + 1).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
    const todayIso = iso(now.getFullYear(), now.getMonth(), now.getDate());

    const draw = () => {
      const first = new Date(y, m, 1).getDay();
      const days = new Date(y, m + 1, 0).getDate();
      let cells = "";
      for (let i = 0; i < first; i++) cells += "<span></span>";
      for (let d = 1; d <= days; d++) {
        const v = iso(y, m, d);
        cells += `<button type="button" class="cal-day ${v === current ? "sel" : ""} ${v === todayIso ? "today" : ""}" data-v="${v}">${d}</button>`;
      }
      $("sheet-body").innerHTML = `
        <div class="cal-head">
          <button type="button" class="icon-btn" data-nav="-1" aria-label="السابق"><i data-lucide="chevron-right"></i></button>
          <strong>${MONTHS[m]} ${y}</strong>
          <button type="button" class="icon-btn" data-nav="1" aria-label="التالي"><i data-lucide="chevron-left"></i></button>
        </div>
        <div class="cal-week">${DAYS_SHORT.map((d) => `<span>${d}</span>`).join("")}</div>
        <div class="cal-grid">${cells}</div>
        <div class="sheet-actions">
          <button type="button" data-today>اليوم</button>
          <button type="button" class="ghost" data-close>إلغاء</button>
        </div>`;
      refreshIcons();
    };

    $("sheet-body").onclick = (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.v) finish(b.dataset.v);
      else if (b.dataset.nav) {
        m += Number(b.dataset.nav);
        if (m < 0) { m = 11; y--; }
        if (m > 11) { m = 0; y++; }
        draw();
      } else if ("today" in b.dataset) finish(todayIso);
      else if ("close" in b.dataset) finish(null);
    };
    draw();
  });
}

/* ===== اختيار الساعة ===== */
export function pickTime(current) {
  return openSheet((finish) => {
    let h = 16, mi = 0;
    if (current) [h, mi] = current.split(":").map(Number);
    let pm = h >= 12, h12 = h % 12 || 12, min = Math.min(55, Math.round(mi / 5) * 5);

    const draw = () => {
      const hours = [...Array(12)].map((_, i) => i + 1);
      const mins = [...Array(12)].map((_, i) => i * 5);
      $("sheet-body").innerHTML = `
        <div class="t-display">${h12}:${String(min).padStart(2, "0")} ${pm ? "م" : "ص"}</div>
        <div class="seg">
          <button type="button" data-ap="am" class="${!pm ? "on" : ""}"><i data-lucide="sun"></i>صباحاً</button>
          <button type="button" data-ap="pm" class="${pm ? "on" : ""}"><i data-lucide="moon"></i>مساءً</button>
        </div>
        <div class="t-label">الساعة</div>
        <div class="t-grid">${hours.map((x) => `<button type="button" class="t-chip ${x === h12 ? "on" : ""}" data-h="${x}">${x}</button>`).join("")}</div>
        <div class="t-label">الدقائق</div>
        <div class="t-grid">${mins.map((x) => `<button type="button" class="t-chip ${x === min ? "on" : ""}" data-m="${x}">${String(x).padStart(2, "0")}</button>`).join("")}</div>
        <div class="sheet-actions">
          <button type="button" data-ok>تأكيد</button>
          <button type="button" class="ghost" data-close>إلغاء</button>
        </div>`;
      refreshIcons();
    };

    $("sheet-body").onclick = (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.h) { h12 = +b.dataset.h; draw(); }
      else if (b.dataset.m !== undefined) { min = +b.dataset.m; draw(); }
      else if (b.dataset.ap) { pm = b.dataset.ap === "pm"; draw(); }
      else if ("ok" in b.dataset) {
        finish(String((h12 % 12) + (pm ? 12 : 0)).padStart(2, "0") + ":" + String(min).padStart(2, "0"));
      } else if ("close" in b.dataset) finish(null);
    };
    draw();
  });
}

/* ===== نوافذ وإشعارات ===== */
const escHtml = (s = "") => String(s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function dialog({ icon = "info", tone = "", title = "", text = "", buttons = [] }) {
  return new Promise((resolve) => {
    const wrap = document.createElement("div");
    wrap.className = "modal";
    wrap.innerHTML = `
      <div class="modal-bg"></div>
      <div class="modal-card glass ${tone}" role="dialog" aria-modal="true">
        <div class="modal-icon"><i data-lucide="${icon}"></i></div>
        <h3>${escHtml(title)}</h3>
        ${text ? `<p>${escHtml(text)}</p>` : ""}
        <div class="modal-actions">
          ${buttons.map((b, i) =>
            `<button type="button" class="${b.ghost ? "ghost" : ""} ${b.danger ? "danger-btn" : ""}" data-i="${i}">${escHtml(b.label)}</button>`
          ).join("")}
        </div>
      </div>`;
    document.body.appendChild(wrap);
    refreshIcons();
    requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add("show")));
    const close = (v) => {
      wrap.classList.remove("show");
      setTimeout(() => wrap.remove(), 260);
      resolve(v);
    };
    wrap.querySelector(".modal-bg").onclick = () => close(null);
    wrap.querySelector(".modal-actions").onclick = (e) => {
      const b = e.target.closest("button");
      if (b) close(buttons[+b.dataset.i].value);
    };
  });
}

export function toast(msg, type = "") {
  const t = document.createElement("div");
  t.className = "toast " + type;
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add("show"));
  setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 320); }, 2600);
}

export function welcomeDialog() {
  const now = new Date(), h = now.getHours();
  const greet = h < 12 ? "صباح الخير" : h < 18 ? "نهارك سعيد" : "مساء الخير";
  return dialog({
    icon: "sparkles", tone: "welcome",
    title: `${greet} أستاذ محمود`,
    text: `اليوم ${DAYS_FULL[now.getDay()]} ${now.getDate()} ${MONTHS[now.getMonth()]}.\nنتمنى لك يوماً موفقاً ومليئاً بالنجاح.`,
    buttons: [{ label: "يلا نبدأ", value: true }]
  });
}

/* ===== هياكل التحميل (Skeleton) ===== */
const skCard = () => `
  <div class="ap-item glass sk-card">
    <div class="sk-time"><div class="sk sk-l" style="width:46px"></div><div class="sk sk-l" style="width:34px"></div></div>
    <div class="sk-body">
      <div class="sk sk-pill"></div>
      <div class="sk sk-l" style="width:62%"></div>
      <div class="sk sk-l" style="width:42%"></div>
    </div>
    <div class="sk-acts"><div class="sk sk-sq"></div><div class="sk sk-sq"></div></div>
  </div>`;
export const skCards = (n = 3) => `<div class="day"><div class="sk sk-h"></div>${skCard().repeat(n)}</div>`;
export const skGroups = (n = 3) => Array(n).fill(
  `<li class="group-item glass sk-card"><div class="sk sk-circle"></div><div class="sk sk-l" style="flex:1;height:16px"></div><div class="sk sk-sq"></div><div class="sk sk-sq"></div></li>`
).join("");
export const skNotifs = (n = 2) => Array(n).fill(
  `<div class="notif glass sk-notif"><div class="sk sk-pill"></div><div class="sk sk-l" style="width:55%;height:18px"></div><div class="sk sk-l" style="width:40%"></div><div class="sk sk-l" style="width:65%"></div><div class="sk sk-btn"></div></div>`
).join("");
export const skTimeline = () =>
  `<div class="sk-tl"><div class="sk sk-block" style="height:88px"></div><div class="sk sk-block" style="height:62px;width:80%"></div><div class="sk sk-block" style="height:110px"></div></div>`;
