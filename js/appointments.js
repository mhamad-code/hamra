import { db } from "./firebase-config.js";
import {
  collection, addDoc, updateDoc, deleteDoc, doc, getDocs, writeBatch,
  onSnapshot, query, orderBy, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {
  go, state, pickDate, pickTime, fmtDate, fmtTime, refreshIcons, dialog, toast
} from "./ui.js";

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
function render() {
  const list = [...appts].sort((a, b) =>
    a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  $("ap-count").textContent = list.length;
  $("ap-empty").classList.toggle("hidden", list.length > 0);

  let html = "", last = "";
  for (const a of list) {
    if (a.date !== last) {
      if (last) html += "</div>";
      html += `<div class="day"><h4>${fmtDate(a.date)}${a.date === todayStr() ? " · اليوم" : ""}</h4>`;
      last = a.date;
    }
    const personal = a.kind === "personal";
    const g = groups.find((x) => x.id === a.groupId);
    const who = personal ? "موعد شخصي" : a.groupId ? (g ? g.name : "مجموعة محذوفة") : (a.studentName || "طالب فردي");
    const color = personal ? PERSONAL_COLOR : (g ? g.color : "#B892FF");
    const tag = personal
      ? '<span class="tag"><i data-lucide="user-round"></i>موعد خاص</span>'
      : a.groupId
        ? '<span class="tag"><i data-lucide="users"></i>درس مجموعة</span>'
        : '<span class="tag"><i data-lucide="user"></i>درس فردي</span>';
    html += `
      <div class="ap-item glass" data-id="${a.id}" style="--c:${color}">
        <div class="ap-time"><b>${fmtTime(a.startTime)}</b><small>${fmtTime(addMinutes(a.startTime, a.durationMin))}</small></div>
        <div class="ap-body">
          ${tag}<strong>${esc(a.title)}${a.seriesId ? ' <i data-lucide="repeat" class="rep"></i>' : ""}</strong>
          ${personal ? "" : `<span class="meta"><i class="dot" style="background:${color}"></i>${esc(who)}</span>`}
          ${a.location ? `<span class="meta"><i data-lucide="map-pin"></i>${esc(a.location)}</span>` : ""}
          ${a.notes ? `<span class="meta"><i data-lucide="sticky-note"></i>${esc(a.notes)}</span>` : ""}
        </div>
        <div class="ap-actions">
          <button class="icon-btn" data-act="edit" aria-label="تعديل"><i data-lucide="pencil"></i></button>
          <button class="icon-btn danger" data-act="del" aria-label="حذف"><i data-lucide="trash-2"></i></button>
        </div>
      </div>`;
  }
  if (last) html += "</div>";
  $("ap-list").innerHTML = html;
  refreshIcons();
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

export async function onEdit(a, from = "appointments") {
  let scope = "one";
  if (a.seriesId) {
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
