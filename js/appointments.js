import { db } from "./firebase-config.js?v=1792876052";
import {
  collection, addDoc, updateDoc, deleteDoc, doc, getDocs, writeBatch,
  onSnapshot, query, orderBy, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {
  go, state, openSheet, pickDate, pickTime, fmtDate, fmtTime, refreshIcons, dialog, toast
} from "./ui.js?v=1792876052";

const $ = (id) => document.getElementById(id);
const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const SHORT_DAYS = ["أحد", "اثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];
const MAX_OCC = 60;
const PERSONAL_COLOR = "#FF7A90";

let started = false, unsubA = null, unsubG = null;
let groups = [], appts = [];
let backTo = "appointments";
let editingId = null, editScope = null, editingSeriesId = null;
let selDate = null, selTime = null, apType = "group";
let repeatOn = false, repDays = [], endMode = "count", repCount = 8, untilDate = null;

const toIso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const todayStr = () => toIso(new Date());
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(36).slice(2));

function addMinutes(t, mins) {
  const [h, m] = t.split(":").map(Number);
  const total = (h * 60 + m + mins) % 1440;
  return String(Math.floor(total / 60)).padStart(2, "0") + ":" + String(total % 60).padStart(2, "0");
}

/* ===== توليد تواريخ التكرار ===== */
function genDates() {
  const out = [];
  if (!selDate || !repDays.length) return out;
  const d = new Date(selDate + "T00:00:00");
  for (let i = 0; i < 800 && out.length < MAX_OCC; i++) {
    const iso = toIso(d);
    if (endMode === "until" && (!untilDate || iso > untilDate)) break;
    if (repDays.includes(d.getDay())) {
      out.push(iso);
      if (endMode === "count" && out.length >= repCount) break;
    }
    d.setDate(d.getDate() + 1);
  }
  return out;
}

function updatePreview() {
  const el = $("ap-repeat-preview");
  if (!repeatOn) { el.textContent = ""; return; }
  if (!repDays.length) { el.textContent = "اختر يوماً واحداً على الأقل."; return; }
  if (endMode === "until" && !untilDate) { el.textContent = "اختر تاريخ النهاية."; return; }
  const dates = genDates();
  if (!dates.length) { el.textContent = "ما في مواعيد بهالإعدادات، تأكد من التواريخ."; return; }
  el.textContent = `رح ينضاف ${dates.length} موعد، من ${fmtDate(dates[0])} إلى ${fmtDate(dates[dates.length - 1])}.`;
}

function renderDays() {
  $("ap-days").innerHTML = SHORT_DAYS.map((n, i) =>
    `<button type="button" class="t-chip ${repDays.includes(i) ? "on" : ""}" data-d="${i}">${n}</button>`).join("");
}

function setRepeat(on) {
  repeatOn = on;
  $("ap-repeat").checked = on;
  $("ap-repeat-opts").classList.toggle("hidden", !on);
  if (on && !repDays.length && selDate) repDays = [new Date(selDate + "T00:00:00").getDay()];
  renderDays();
  updatePreview();
}

function setEnd(m) {
  endMode = m;
  document.querySelectorAll("#ap-end-seg [data-end]").forEach((b) =>
    b.classList.toggle("on", b.dataset.end === m));
  $("ap-count-wrap").classList.toggle("hidden", m !== "count");
  $("ap-until-wrap").classList.toggle("hidden", m !== "until");
  updatePreview();
}

function setCount(n) {
  repCount = Math.max(1, Math.min(52, n));
  $("ap-rep-count").textContent = repCount;
  updatePreview();
}

/* ===== حقول النموذج ===== */
function setDate(v) {
  selDate = v;
  $("ap-date-label").textContent = v ? fmtDate(v) : "اختر التاريخ";
  $("ap-date-btn").classList.toggle("placeholder", !v);
  updatePreview();
}
function setTime(v) {
  selTime = v;
  $("ap-time-label").textContent = v ? fmtTime(v) : "اختر الساعة";
  $("ap-time-btn").classList.toggle("placeholder", !v);
}
function setType(t) {
  apType = t;
  document.querySelectorAll("#ap-type-seg [data-type]").forEach((b) =>
    b.classList.toggle("on", b.dataset.type === t));
  $("ap-group-wrap").classList.toggle("hidden", t !== "group");
  $("ap-student-wrap").classList.toggle("hidden", t !== "individual");
  $("ap-title").placeholder = t === "personal" ? "مثلاً: موعد طبيب، اجتماع..." : "حصة رياضيات";
  $("ap-title-label").textContent = t === "personal" ? "عنوان الموعد" : "عنوان الموعد (اختياري)";
}
function fillGroupSelect() {
  const sel = $("ap-group"), cur = sel.value;
  sel.innerHTML = groups.length
    ? groups.map((g) => `<option value="${g.id}">${esc(g.name)}</option>`).join("")
    : `<option value="">أضف مجموعة من صفحة المجموعات</option>`;
  if (groups.some((g) => g.id === cur)) sel.value = cur;
}

function resetForm() {
  backTo = "appointments";
  editingId = null; editScope = null; editingSeriesId = null;
  $("ap-form").reset();
  repDays = []; untilDate = null; repCount = 8;
  $("ap-until-label").textContent = "اختر تاريخ النهاية";
  setType("group");
  setDate(todayStr());
  setTime(null);
  fillGroupSelect();
  setCount(8);
  setEnd("count");
  setRepeat(false);
  $("ap-repeat-wrap").classList.remove("hidden");
  $("ap-date-btn").parentElement.classList.remove("hidden");
  $("ap-series-note").classList.add("hidden");
  $("ap-form-title").textContent = "موعد جديد";
}

/* ===== عرض القائمة ===== */
let openSid = null, sheetFinish = null;

const durText = (m) => {
  const h = Math.floor(m / 60), r = m % 60, p = [];
  if (h === 1) p.push("ساعة"); else if (h === 2) p.push("ساعتان"); else if (h > 2) p.push(`${h} ساعات`);
  if (r) p.push(`${r} دقيقة`);
  return p.join(" و ");
};

function relText(date) {
  const diff = Math.round((new Date(date + "T00:00:00") - new Date(todayStr() + "T00:00:00")) / 86400000);
  if (diff <= 0) return "اليوم";
  if (diff === 1) return "غداً";
  if (diff === 2) return "بعد يومين";
  if (diff <= 10) return `بعد ${diff} أيام`;
  return `بعد ${diff} يوم`;
}

function aColor(a) {
  if (a.kind === "personal") return PERSONAL_COLOR;
  const g = groups.find((x) => x.id === a.groupId);
  return g ? g.color : "#B892FF";
}
function aWho(a) {
  if (a.kind === "personal") return "";
  if (a.groupId) { const g = groups.find((x) => x.id === a.groupId); return g ? g.name : "مجموعة محذوفة"; }
  return a.studentName || "طالب فردي";
}
function aTagHtml(a) {
  return a.kind === "personal"
    ? '<span class="tag"><i data-lucide="user-round"></i>موعد خاص</span>'
    : a.groupId
      ? '<span class="tag"><i data-lucide="users"></i>درس مجموعة</span>'
      : '<span class="tag"><i data-lucide="user"></i>درس فردي</span>';
}

function weekdaysOf(items) {
  const c = {};
  items.forEach((a) => { const d = new Date(a.date + "T00:00:00").getDay(); c[d] = (c[d] || 0) + 1; });
  const mx = Math.max(...Object.values(c));
  return Object.keys(c).map(Number).filter((d) => c[d] * 3 >= mx).sort((a, b) => a - b);
}

function seriesItems(sid) {
  return appts.filter((a) => a.seriesId === sid)
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
}

function singleCard(a) {
  const color = aColor(a), who = aWho(a);
  return `
    <div class="ap-item glass" data-id="${a.id}" style="--c:${color}">
      <div class="ap-time"><b>${fmtTime(a.startTime)}</b><small>${fmtTime(addMinutes(a.startTime, a.durationMin))}</small></div>
      <div class="ap-body">
        ${aTagHtml(a)}
        <strong>${esc(a.title)}</strong>
        ${who ? `<span class="meta"><i class="dot" style="background:${color}"></i>${esc(who)}</span>` : ""}
        ${a.location ? `<span class="meta"><i data-lucide="map-pin"></i>${esc(a.location)}</span>` : ""}
        ${a.notes ? `<span class="meta"><i data-lucide="sticky-note"></i>${esc(a.notes)}</span>` : ""}
      </div>
      <div class="ap-actions">
        <button class="icon-btn" data-act="edit" aria-label="تعديل"><i data-lucide="pencil"></i></button>
        <button class="icon-btn danger" data-act="del" aria-label="حذف"><i data-lucide="trash-2"></i></button>
      </div>
    </div>`;
}

function seriesCard(en) {
  const items = en.items, f = items[0], l = items[items.length - 1];
  const color = aColor(f), who = aWho(f);
  const wd = weekdaysOf(items).map((d) => SHORT_DAYS[d]).join(" و ");
  return `
    <div class="ap-item ap-series glass" data-sid="${en.sid}" style="--c:${color}" role="button" tabindex="0">
      <div class="ap-time"><b>${fmtTime(f.startTime)}</b><small>${fmtTime(addMinutes(f.startTime, f.durationMin))}</small></div>
      <div class="ap-body">
        ${aTagHtml(f)}
        <strong>${esc(f.title)} <i data-lucide="repeat" class="rep"></i></strong>
        ${who ? `<span class="meta"><i class="dot" style="background:${color}"></i>${esc(who)}</span>` : ""}
        <span class="meta"><i data-lucide="repeat"></i>كل ${wd}</span>
        <span class="meta"><i data-lucide="calendar-clock"></i>${items.length} موعد قادم · حتى ${fmtDate(l.date)}</span>
        <span class="next-pill">الجاي: ${relText(f.date)}</span>
      </div>
      <i data-lucide="chevron-left" class="chev"></i>
    </div>`;
}

function render() {
  const sorted = [...appts].sort((a, b) =>
    a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));

  const bySid = {}, entries = [];
  for (const a of sorted) {
    if (a.seriesId) {
      if (!bySid[a.seriesId]) {
        bySid[a.seriesId] = [];
        entries.push({ series: true, sid: a.seriesId, date: a.date, items: bySid[a.seriesId] });
      }
      bySid[a.seriesId].push(a);
    } else {
      entries.push({ series: false, date: a.date, a });
    }
  }

  $("ap-count").textContent = entries.length;
  $("ap-empty").classList.toggle("hidden", entries.length > 0);

  let html = "", last = "";
  for (const en of entries) {
    if (en.date !== last) {
      if (last) html += "</div>";
      html += `<div class="day"><h4>${fmtDate(en.date)}${en.date === todayStr() ? " · اليوم" : ""}</h4>`;
      last = en.date;
    }
    html += en.series ? seriesCard(en) : singleCard(en.a);
  }
  if (last) html += "</div>";
  $("ap-list").innerHTML = html;
  refreshIcons();
  if (openSid) drawSheet();
}

/* ===== نافذة تفاصيل السلسلة ===== */
function drawSheet() {
  const items = seriesItems(openSid);
  if (!items.length) { if (sheetFinish) sheetFinish(null); return; }
  const f = items[0], l = items[items.length - 1];
  const color = aColor(f), who = aWho(f);
  const wd = weekdaysOf(items).map((d) => SHORT_DAYS[d]).join(" و ");

  $("sheet-body").innerHTML = `
    <div class="sh-head" style="--c:${color}">
      <div class="sh-ic"><i data-lucide="repeat"></i></div>
      <div><h3>${esc(f.title)}</h3>${aTagHtml(f)}</div>
    </div>
    <div class="sh-info">
      <div><i data-lucide="repeat"></i><span>كل ${wd}</span></div>
      <div><i data-lucide="clock"></i><span>${fmtTime(f.startTime)} – ${fmtTime(addMinutes(f.startTime, f.durationMin))} · ${durText(f.durationMin)}</span></div>
      <div><i data-lucide="calendar-range"></i><span>من ${fmtDate(f.date)} إلى ${fmtDate(l.date)}</span></div>
      ${who ? `<div><i data-lucide="users"></i><span>${esc(who)}</span></div>` : ""}
      ${f.location ? `<div><i data-lucide="map-pin"></i><span>${esc(f.location)}</span></div>` : ""}
      ${f.notes ? `<div><i data-lucide="sticky-note"></i><span>${esc(f.notes)}</span></div>` : ""}
    </div>
    <div class="sh-dates-title">كل المواعيد القادمة (${items.length})</div>
    <div class="sh-dates">
      ${items.map((a, i) => `
        <div class="sh-date ${i === 0 ? "next" : ""}">
          <span class="n">${i + 1}</span>
          <div class="d"><b>${fmtDate(a.date)}</b>${i === 0 ? `<small>${relText(a.date)}</small>` : ""}</div>
          <button type="button" class="icon-btn" data-act="edit-one" data-id="${a.id}" aria-label="تعديل هذا الموعد"><i data-lucide="pencil"></i></button>
          <button type="button" class="icon-btn danger" data-act="del-one" data-id="${a.id}" aria-label="حذف هذا الموعد"><i data-lucide="trash-2"></i></button>
        </div>`).join("")}
    </div>
    <div class="sh-actions">
      <button type="button" data-act="edit-series"><i data-lucide="pencil"></i>تعديل السلسلة كاملة</button>
      <button type="button" class="danger-btn" data-act="del-series"><i data-lucide="trash-2"></i>حذف السلسلة</button>
      <button type="button" class="ghost" data-act="close">إغلاق</button>
    </div>`;
  refreshIcons();
}

async function onSheetClick(e) {
  const b = e.target.closest("[data-act]");
  if (!b || !sheetFinish) return;
  const act = b.dataset.act;
  if (act === "close") return sheetFinish(null);
  if (act === "del-one") {
    const a = appts.find((x) => x.id === b.dataset.id);
    if (!a) return;
    const r = await dialog({
      icon: "trash-2", tone: "danger", title: "حذف هذا الموعد",
      text: `بدك تحذف موعد ${fmtDate(a.date)} فقط؟ باقي السلسلة ما رح يتأثر.`,
      buttons: [{ label: "حذف", value: "yes", danger: true }, { label: "إلغاء", value: null, ghost: true }]
    });
    if (r === "yes") {
      try { await deleteDoc(doc(db, "appointments", a.id)); toast("تم حذف الموعد", "ok"); }
      catch (err) { console.error(err); toast("تعذّر الحذف", "error"); }
    }
    return;
  }
  sheetFinish({ act, id: b.dataset.id });
}

async function delSeries(sid, n) {
  const r = await dialog({
    icon: "trash-2", tone: "danger", title: "حذف السلسلة",
    text: `رح تنحذف كل المواعيد القادمة بهالسلسلة (${n} موعد). المواعيد السابقة بتضل محفوظة.`,
    buttons: [{ label: "حذف السلسلة", value: "yes", danger: true }, { label: "إلغاء", value: null, ghost: true }]
  });
  if (r !== "yes") return;
  try {
    const docs = await seriesDocs(sid);
    for (let i = 0; i < docs.length; i += 400) {
      const batch = writeBatch(db);
      docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
    toast(`تم حذف ${docs.length} موعد`, "ok");
  } catch (err) {
    console.error(err);
    toast("تعذّر الحذف", "error");
  }
}

async function openSeries(sid) {
  openSid = sid;
  const res = await openSheet((finish) => {
    sheetFinish = finish;
    drawSheet();
    $("sheet-body").onclick = onSheetClick;
  });
  const items = seriesItems(sid);
  openSid = null; sheetFinish = null;
  if (!res) return;
  if (res.act === "edit-one") {
    const a = appts.find((x) => x.id === res.id);
    if (a) onEdit({ ...a, seriesId: null }, "appointments");
  } else if (res.act === "edit-series") {
    if (items[0]) onEdit(items[0], "appointments", "series");
  } else if (res.act === "del-series") {
    delSeries(sid, items.length);
  }
}

/* ===== حذف وتعديل ===== */
async function seriesDocs(seriesId) {
  const snap = await getDocs(query(collection(db, "appointments"), where("seriesId", "==", seriesId)));
  return snap.docs.filter((d) => d.data().date >= todayStr());
}

export async function onDelete(a) {
  try {
    if (a.seriesId) {
      const r = await dialog({
        icon: "repeat", title: "موعد متكرر", text: "شو بدك تحذف؟",
        buttons: [
          { label: "هذا الموعد فقط", value: "one" },
          { label: "كل المواعيد القادمة بالسلسلة", value: "series", danger: true },
          { label: "إلغاء", value: null, ghost: true }
        ]
      });
      if (r === "one") {
        await deleteDoc(doc(db, "appointments", a.id));
        toast("تم حذف الموعد", "ok");
      } else if (r === "series") {
        const docs = await seriesDocs(a.seriesId);
        const batch = writeBatch(db);
        docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
        toast(`تم حذف ${docs.length} موعد`, "ok");
      }
    } else {
      const r = await dialog({
        icon: "trash-2", tone: "danger", title: "حذف الموعد",
        text: `بدك تحذف "${a.title}"؟`,
        buttons: [{ label: "حذف", value: "yes", danger: true }, { label: "إلغاء", value: null, ghost: true }]
      });
      if (r === "yes") {
        await deleteDoc(doc(db, "appointments", a.id));
        toast("تم حذف الموعد", "ok");
      }
    }
  } catch (err) {
    console.error(err);
    toast("تعذّر الحذف", "error");
  }
}

export async function onEdit(a, from = "appointments", forced = null) {
  let scope = forced || "one";
  if (a.seriesId && !forced) {
    const r = await dialog({
      icon: "repeat", title: "موعد متكرر", text: "شو بدك تعدّل؟",
      buttons: [
        { label: "هذا الموعد فقط", value: "one" },
        { label: "كل المواعيد القادمة بالسلسلة", value: "series" },
        { label: "إلغاء", value: null, ghost: true }
      ]
    });
    if (!r) return;
    scope = r;
  }
  resetForm();
  editingId = a.id; editScope = scope; editingSeriesId = a.seriesId || null;

  setType(a.kind === "personal" ? "personal" : a.groupId ? "group" : "individual");
  fillGroupSelect();
  if (a.groupId) $("ap-group").value = a.groupId;
  $("ap-student").value = a.studentName || "";
  $("ap-title").value = a.title;
  setDate(a.date);
  setTime(a.startTime);
  $("ap-duration").value = String(a.durationMin);
  $("ap-location").value = a.location || "";
  $("ap-notes").value = a.notes || "";

  $("ap-repeat-wrap").classList.add("hidden");
  if (scope === "series") {
    $("ap-date-btn").parentElement.classList.add("hidden");
    $("ap-series-note").classList.remove("hidden");
    $("ap-form-title").textContent = "تعديل السلسلة";
  } else {
    $("ap-form-title").textContent = "تعديل موعد";
  }
  backTo = from;
  go("new-appointment");
}

export function newForGroup(groupId) {
  resetForm();
  setType("group");
  fillGroupSelect();
  $("ap-group").value = groupId;
  backTo = "group";
  go("new-appointment");
}

/* ===== التشغيل ===== */
export function initAppointments() {
  if (started) return;
  started = true;
  resetForm();

  $("nav-add").onclick = () => {
    const fromCal = location.hash === "#calendar" && state.calDate;
    resetForm();
    if (fromCal) { setDate(state.calDate); backTo = "calendar"; }
    go("new-appointment");
  };
  $("ap-back").onclick = () => go(backTo);

  $("ap-type-seg").onclick = (e) => {
    const b = e.target.closest("[data-type]");
    if (b) setType(b.dataset.type);
  };
  $("ap-date-btn").onclick = async () => { const v = await pickDate(selDate); if (v) setDate(v); };
  $("ap-time-btn").onclick = async () => { const v = await pickTime(selTime); if (v) setTime(v); };

  $("ap-repeat").onchange = (e) => setRepeat(e.target.checked);
  $("ap-days").onclick = (e) => {
    const b = e.target.closest("[data-d]");
    if (!b) return;
    const d = +b.dataset.d;
    repDays = repDays.includes(d) ? repDays.filter((x) => x !== d) : [...repDays, d];
    renderDays();
    updatePreview();
  };
  $("ap-end-seg").onclick = (e) => {
    const b = e.target.closest("[data-end]");
    if (b) setEnd(b.dataset.end);
  };
  $("cnt-minus").onclick = () => setCount(repCount - 1);
  $("cnt-plus").onclick = () => setCount(repCount + 1);
  $("ap-until-btn").onclick = async () => {
    const v = await pickDate(untilDate || selDate);
    if (v) { untilDate = v; $("ap-until-label").textContent = fmtDate(v); updatePreview(); }
  };

  $("ap-form").onsubmit = async (e) => {
    e.preventDefault();
    const isGroup = apType === "group";
    if (isGroup && !$("ap-group").value) return toast("اختر مجموعة، أو أضف مجموعة أولاً", "warn");
    if (apType === "personal" && !$("ap-title").value.trim()) return toast("اكتب عنوان الموعد", "warn");
    if (editScope !== "series" && !selDate) return toast("اختر التاريخ", "warn");
    if (!selTime) return toast("اختر الساعة", "warn");

    const common = {
      title: $("ap-title").value.trim() || "حصة رياضيات",
      kind: apType === "personal" ? "personal" : "lesson",
      groupId: isGroup ? $("ap-group").value : null,
      studentName: apType === "individual" ? $("ap-student").value.trim() : null,
      startTime: selTime,
      durationMin: Number($("ap-duration").value),
      location: $("ap-location").value.trim(),
      notes: $("ap-notes").value.trim()
    };

    const btn = $("ap-submit");
    btn.disabled = true;
    try {
      if (editingId && editScope === "series") {
        const docs = await seriesDocs(editingSeriesId);
        const batch = writeBatch(db);
        docs.forEach((d) => batch.update(d.ref, common));
        await batch.commit();
        toast(`تم تعديل ${docs.length} موعد`, "ok");
      } else if (editingId) {
        await updateDoc(doc(db, "appointments", editingId), { ...common, date: selDate });
        toast("تم حفظ التعديل", "ok");
      } else if (repeatOn) {
        if (!repDays.length) return toast("اختر يوماً واحداً على الأقل للتكرار", "warn");
        if (endMode === "until" && !untilDate) return toast("اختر تاريخ النهاية", "warn");
        const dates = genDates();
        if (!dates.length) return toast("ما في مواعيد بهالإعدادات، تأكد من التواريخ", "warn");
        const seriesId = newId();
        const batch = writeBatch(db);
        dates.forEach((date) =>
          batch.set(doc(collection(db, "appointments")),
            { ...common, date, seriesId, createdAt: serverTimestamp() }));
        await batch.commit();
        toast(`تمت إضافة ${dates.length} موعد`, "ok");
      } else {
        await addDoc(collection(db, "appointments"),
          { ...common, date: selDate, seriesId: null, createdAt: serverTimestamp() });
        toast("تمت إضافة الموعد", "ok");
      }
      const dest = backTo;
      resetForm();
      go(dest);
    } catch (err) {
      console.error(err);
      toast("تعذّر الحفظ. تأكد من قواعد Firestore", "error");
    } finally {
      btn.disabled = false;
    }
  };

  $("ap-list").onclick = (e) => {
    const sc = e.target.closest(".ap-series");
    if (sc) return openSeries(sc.dataset.sid);
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const a = appts.find((x) => x.id === btn.closest(".ap-item").dataset.id);
    if (!a) return;
    if (btn.dataset.act === "del") onDelete(a); else onEdit(a);
  };

  unsubG = onSnapshot(
    query(collection(db, "groups"), orderBy("createdAt")),
    (snap) => {
      groups = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      fillGroupSelect();
      render();
    },
    (err) => console.error("groups:", err)
  );

  unsubA = onSnapshot(
    query(collection(db, "appointments"), where("date", ">=", todayStr()), orderBy("date")),
    (snap) => {
      appts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      render();
    },
    (err) => console.error("appointments:", err)
  );
}

export function stopAppointments() {
  if (unsubA) unsubA();
  if (unsubG) unsubG();
  unsubA = unsubG = null;
  started = false;
}
