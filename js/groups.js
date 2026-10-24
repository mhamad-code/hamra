import { skGroups, skCards } from "./ui.js?v=1792877538";
import { db } from "./firebase-config.js?v=1792877538";
import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  onSnapshot, query, orderBy, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { go, state, refreshIcons, dialog, toast, fmtDate, fmtTime } from "./ui.js?v=1792877538";
import { onEdit, onDelete, newForGroup } from "./appointments.js?v=1792877538";

const COLORS = ["#FFB23E", "#B892FF", "#5EEAD4", "#FF7A90", "#6EA8FF", "#A3E635"];
const DAYS = ["أحد", "اثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];
const $ = (id) => document.getElementById(id);
const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let started = false, unsub = null, unsubD = null;
let color = COLORS[0], editingId = null, fromDetail = false;
let groupsData = [], detailAppts = [];
let gReady = false, dReady = false;

const toIso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const todayStr = () => toIso(new Date());

function addMinutes(t, mins) {
  const [h, m] = t.split(":").map(Number);
  const total = (h * 60 + m + mins) % 1440;
  return String(Math.floor(total / 60)).padStart(2, "0") + ":" + String(total % 60).padStart(2, "0");
}

function renderSwatches() {
  $("swatches").innerHTML = COLORS.map((c) =>
    `<button type="button" class="sw ${c === color ? "on" : ""}" data-c="${c}" style="background:${c}" aria-label="لون"></button>`
  ).join("");
}

function resetForm() {
  editingId = null;
  fromDetail = false;
  color = COLORS[0];
  $("group-name").value = "";
  $("group-form-title").textContent = "مجموعة جديدة";
  renderSwatches();
}

function startEdit(g, fromD) {
  editingId = g.id;
  fromDetail = fromD;
  color = g.color;
  $("group-name").value = g.name;
  $("group-form-title").textContent = "تعديل مجموعة";
  renderSwatches();
  go("new-group");
}

/* ===== قائمة المجموعات ===== */
function renderList() {
  if (!gReady) {
    $("groups-count").textContent = "";
    $("groups-empty").classList.add("hidden");
    $("groups-list").innerHTML = skGroups(3);
    return;
  }
  $("groups-count").textContent = groupsData.length;
  $("groups-empty").classList.toggle("hidden", groupsData.length > 0);
  $("groups-list").innerHTML = groupsData.map((g) => `
    <li class="group-item glass" data-id="${g.id}">
      <span class="dot" style="background:${g.color}"></span>
      <span class="gname">${esc(g.name)}</span>
      <button class="icon-btn" data-act="edit" aria-label="تعديل"><i data-lucide="pencil"></i></button>
      <button class="icon-btn danger" data-act="del" aria-label="حذف"><i data-lucide="trash-2"></i></button>
      <i data-lucide="chevron-left" class="chev"></i>
    </li>`).join("");
  refreshIcons();
}

/* ===== صفحة تفاصيل المجموعة ===== */
function itemHtml(a, color, actions) {
  return `
    <div class="ap-item glass ${actions ? "" : "past-item"}" data-id="${a.id}" style="--c:${color}">
      <div class="ap-time"><b>${fmtTime(a.startTime)}</b><small>${fmtTime(addMinutes(a.startTime, a.durationMin))}</small></div>
      <div class="ap-body">
        <strong>${esc(a.title)}${a.seriesId ? ' <i data-lucide="repeat" class="rep"></i>' : ""}</strong>
        ${a.location ? `<span class="meta"><i data-lucide="map-pin"></i>${esc(a.location)}</span>` : ""}
        ${a.notes ? `<span class="meta"><i data-lucide="sticky-note"></i>${esc(a.notes)}</span>` : ""}
      </div>
      ${actions ? `<div class="ap-actions">
        <button class="icon-btn" data-act="edit" aria-label="تعديل"><i data-lucide="pencil"></i></button>
        <button class="icon-btn danger" data-act="del" aria-label="حذف"><i data-lucide="trash-2"></i></button>
      </div>` : ""}
    </div>`;
}

function renderDetail() {
  if (!state.groupId) return;
  const g = groupsData.find((x) => x.id === state.groupId);
  if (!g) { state.groupId = null; go("groups"); return; }

  $("gd-title").textContent = g.name;
  $("gd-dot").style.background = g.color;
  if (!dReady) {
    $("gd-series").innerHTML = "";
    $("gd-list").innerHTML = skCards(3);
    $("gd-empty").classList.add("hidden");
    $("gd-past").classList.add("hidden");
    return;
  }

  const today = todayStr();
  const upcoming = detailAppts.filter((a) => a.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  const past = detailAppts.filter((a) => a.date < today)
    .sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime));

  // ملخص السلاسل المتكررة
  const series = {};
  upcoming.forEach((a) => { if (a.seriesId) (series[a.seriesId] ||= []).push(a); });
  $("gd-series").innerHTML = Object.values(series).map((items) => {
    const days = [...new Set(items.map((x) => new Date(x.date + "T00:00:00").getDay()))]
      .sort().map((d) => DAYS[d]).join(" و");
    const last = items[items.length - 1];
    return `<div class="series-card glass" style="--c:${g.color}">
      <i data-lucide="repeat"></i>
      <div><b>كل ${days} · ${fmtTime(items[0].startTime)}</b>
      <small>${items.length} موعد قادم · حتى ${fmtDate(last.date)}</small></div>
    </div>`;
  }).join("");

  // المواعيد القادمة
  let html = "", lastDay = "";
  for (const a of upcoming) {
    if (a.date !== lastDay) {
      if (lastDay) html += "</div>";
      html += `<div class="day"><h4>${fmtDate(a.date)}${a.date === today ? " · اليوم" : ""}</h4>`;
      lastDay = a.date;
    }
    html += itemHtml(a, g.color, true);
  }
  if (lastDay) html += "</div>";
  $("gd-list").innerHTML = html;
  $("gd-empty").classList.toggle("hidden", upcoming.length > 0);

  // السابقة
  $("gd-past").classList.toggle("hidden", past.length === 0);
  $("gd-past-title").textContent = `المواعيد السابقة (${past.length})`;
  $("gd-past-list").innerHTML = past.map((a) =>
    `<div class="day"><h4>${fmtDate(a.date)}</h4>${itemHtml(a, g.color, false)}</div>`).join("");

  refreshIcons();
}

function openGroup(id) {
  state.groupId = id;
  detailAppts = [];
  dReady = false;
  if (unsubD) unsubD();
  unsubD = onSnapshot(
    query(collection(db, "appointments"), where("groupId", "==", id)),
    (snap) => {
      detailAppts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      dReady = true;
      renderDetail();
    },
    (err) => { dReady = true; renderDetail(); console.error("group appts:", err); }
  );
  renderDetail();
  go("group");
}

/* ===== التشغيل ===== */
export function initGroups() {
  if (started) return;
  started = true;
  resetForm();
  renderList();

  $("group-add-btn").onclick = () => { resetForm(); go("new-group"); };
  $("group-back").onclick = () => go(fromDetail && state.groupId ? "group" : "groups");
  $("gd-back").onclick = () => go("groups");
  $("gd-add").onclick = () => newForGroup(state.groupId);
  $("gd-edit").onclick = () => {
    const g = groupsData.find((x) => x.id === state.groupId);
    if (g) startEdit(g, true);
  };

  $("swatches").onclick = (e) => {
    const b = e.target.closest(".sw");
    if (!b) return;
    color = b.dataset.c;
    renderSwatches();
  };

  $("group-form").onsubmit = async (e) => {
    e.preventDefault();
    const name = $("group-name").value.trim();
    if (!name) return;
    const dest = fromDetail && state.groupId ? "group" : "groups";
    try {
      if (editingId) await updateDoc(doc(db, "groups", editingId), { name, color });
      else await addDoc(collection(db, "groups"), { name, color, createdAt: serverTimestamp() });
      toast("تم الحفظ", "ok");
      resetForm();
      go(dest);
    } catch (err) {
      console.error(err);
      toast("تعذّر الحفظ. تأكد من قواعد Firestore", "error");
    }
  };

  $("groups-list").onclick = async (e) => {
    const li = e.target.closest(".group-item");
    if (!li) return;
    const g = groupsData.find((x) => x.id === li.dataset.id);
    if (!g) return;
    const btn = e.target.closest("[data-act]");
    if (!btn) return openGroup(g.id);
    if (btn.dataset.act === "edit") return startEdit(g, false);
    const r = await dialog({
      icon: "trash-2", tone: "danger", title: "حذف المجموعة",
      text: `بدك تحذف مجموعة "${g.name}"؟ مواعيدها رح تضل بس بدون مجموعة.`,
      buttons: [{ label: "حذف", value: "yes", danger: true }, { label: "إلغاء", value: null, ghost: true }]
    });
    if (r === "yes") { await deleteDoc(doc(db, "groups", g.id)); toast("تم حذف المجموعة", "ok"); }
  };

  $("gd-list").onclick = (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const a = detailAppts.find((x) => x.id === btn.closest(".ap-item").dataset.id);
    if (!a) return;
    if (btn.dataset.act === "del") onDelete(a); else onEdit(a, "group");
  };

  unsub = onSnapshot(
    query(collection(db, "groups"), orderBy("createdAt")),
    (snap) => {
      groupsData = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      gReady = true;
      renderList();
      renderDetail();
    },
    (err) => { gReady = true; renderList(); console.error("groups:", err); }
  );
}

export function stopGroups() {
  if (unsub) unsub();
  if (unsubD) unsubD();
  unsub = unsubD = null;
  gReady = dReady = false;
  state.groupId = null;
  started = false;
}
