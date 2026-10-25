import { skNotifs } from "./ui.js?v=1792924831";
import { db } from "./firebase-config.js?v=1792924831";
import {
  collection, doc, onSnapshot, query, where, orderBy, writeBatch, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { refreshIcons, dialog, toast, fmtDate, fmtTime, MONTHS } from "./ui.js?v=1792924831";

const SOON_DAYS = 7;   // كم يوم قبل نهاية السلسلة يطلع التنبيه
const DAYS = ["أحد", "اثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];

const $ = (id) => document.getElementById(id);
const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let started = false, unsubS = null, unsubG = null;
let groups = [], seriesDocs = [], notifs = [];
let sReady = false, nGReady = false;

const toIso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parseIso = (s) => new Date(s + "T00:00:00");
const todayStr = () => toIso(new Date());

/* الشهر الهدف للتجديد:
   - إذا السلسلة انتهت بشهر سابق للشهر الحالي: الشهر الحالي من اليوم وطالع
   - غير هيك: الشهر اللي بعد شهر آخر موعد، من أول يوم فيه */
function targetRange(lastIso, todayIso) {
  const last = parseIso(lastIso), now = parseIso(todayIso);
  const lastKey = last.getFullYear() * 12 + last.getMonth();
  const nowKey = now.getFullYear() * 12 + now.getMonth();
  let y, m, from;
  if (lastKey < nowKey) { y = now.getFullYear(); m = now.getMonth(); from = now; }
  else { const k = lastKey + 1; y = Math.floor(k / 12); m = k % 12; from = new Date(y, m, 1); }
  return { y, m, from, to: new Date(y, m + 1, 0) };
}

function analyze() {
  const today = todayStr();
  const lim = parseIso(today);
  lim.setDate(lim.getDate() + SOON_DAYS);
  const limit = toIso(lim);

  const map = {};
  seriesDocs.forEach((a) => { if (a.seriesId) (map[a.seriesId] ||= []).push(a); });

  const out = [];
  for (const [sid, items] of Object.entries(map)) {
    items.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
    const last = items[items.length - 1];
    if (last.date > limit) continue;

    // أيام الأسبوع الأساسية للسلسلة (بنتجاهل موعد انتقل بالغلط ليوم ثاني)
    const counts = {};
    items.forEach((a) => { const d = parseIso(a.date).getDay(); counts[d] = (counts[d] || 0) + 1; });
    const maxC = Math.max(...Object.values(counts));
    const wdays = Object.keys(counts).map(Number).filter((d) => counts[d] * 3 >= maxC).sort((a, b) => a - b);

    const r = targetRange(last.date, today);
    const dates = [];
    for (let d = new Date(r.from); d <= r.to; d.setDate(d.getDate() + 1)) {
      if (wdays.includes(d.getDay())) dates.push(toIso(d));
    }
    const daysLeft = Math.round((parseIso(last.date) - parseIso(today)) / 86400000);
    out.push({ sid, items, last, ended: last.date < today, daysLeft, wdays, month: r.m, dates });
  }
  return out.sort((a, b) => a.last.date.localeCompare(b.last.date));
}

function statusText(n) {
  if (n.ended) return "انتهت";
  if (n.daysLeft === 0) return "تنتهي اليوم";
  if (n.daysLeft === 1) return "تنتهي غداً";
  return `تنتهي بعد ${n.daysLeft} أيام`;
}

function whoOf(a) {
  if (a.kind === "personal") return "موعد خاص";
  if (a.groupId) { const g = groups.find((x) => x.id === a.groupId); return g ? g.name : "مجموعة محذوفة"; }
  return a.studentName || "طالب فردي";
}
function colorOf(a) {
  if (a.kind === "personal") return "#FF7A90";
  const g = groups.find((x) => x.id === a.groupId);
  return g ? g.color : "#B892FF";
}

function render() {
  if (!sReady || !nGReady) {
    $("notif-count").textContent = "";
    $("nav-badge").classList.add("hidden");
    $("notif-empty").classList.add("hidden");
    $("notif-list").innerHTML = skNotifs(2);
    return;
  }
  notifs = analyze();
  $("notif-count").textContent = notifs.length;
  const nb = $("nav-badge");
  nb.textContent = notifs.length;
  nb.classList.toggle("hidden", notifs.length === 0);
  $("notif-empty").classList.toggle("hidden", notifs.length > 0);

  $("notif-list").innerHTML = notifs.map((n) => {
    const a = n.last;
    return `
    <div class="notif glass ${n.ended ? "ended" : "soon"}" data-sid="${n.sid}" style="--c:${colorOf(a)}">
      <span class="status"><i data-lucide="${n.ended ? "calendar-x" : "hourglass"}"></i>${statusText(n)}</span>
      <strong>${esc(a.title)}</strong>
      <span class="meta"><i class="dot" style="background:${colorOf(a)}"></i>${esc(whoOf(a))}</span>
      <span class="meta"><i data-lucide="repeat"></i>كل ${n.wdays.map((d) => DAYS[d]).join(" و ")} · ${fmtTime(a.startTime)}</span>
      <span class="meta"><i data-lucide="calendar-clock"></i>آخر موعد: ${fmtDate(a.date)}</span>
      <div class="notif-actions">
        <button type="button" data-act="renew"><i data-lucide="refresh-cw"></i>تجديد لشهر ${MONTHS[n.month]}</button>
        <button type="button" class="del" data-act="del" aria-label="حذف"><i data-lucide="trash-2"></i>حذف</button>
      </div>
      <small class="hint">رح ينضاف ${n.dates.length} موعد بنفس الأيام والساعة</small>
    </div>`;
  }).join("");
  refreshIcons();
}

async function renew(n) {
  if (!n.dates.length) return toast("ما في تواريخ لإضافتها", "warn");
  const t = n.last;
  const tpl = {
    title: t.title, kind: t.kind || "lesson", groupId: t.groupId || null,
    studentName: t.studentName || null, startTime: t.startTime,
    durationMin: t.durationMin, location: t.location || "", notes: t.notes || "",
    seriesId: n.sid
  };
  const batch = writeBatch(db);
  n.dates.forEach((date) =>
    batch.set(doc(collection(db, "appointments")), { ...tpl, date, createdAt: serverTimestamp() }));
  await batch.commit();
  toast(`تم التجديد لشهر ${MONTHS[n.month]} (${n.dates.length} موعد)`, "ok");
}

async function remove(n) {
  const r = await dialog({
    icon: "trash-2", tone: "danger", title: "حذف السلسلة",
    text: `رح تنحذف كل مواعيد "${n.last.title}" (${n.items.length} موعد، القديمة والقادمة) ولا يمكن الرجوع عنها.`,
    buttons: [{ label: "حذف", value: "yes", danger: true }, { label: "إلغاء", value: null, ghost: true }]
  });
  if (r !== "yes") return;
  for (let i = 0; i < n.items.length; i += 400) {
    const batch = writeBatch(db);
    n.items.slice(i, i + 400).forEach((a) => batch.delete(doc(db, "appointments", a.id)));
    await batch.commit();
  }
  toast("تم حذف السلسلة", "ok");
}

export function initNotifications() {
  if (started) return;
  started = true;
  render();

  $("notif-list").onclick = async (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const n = notifs.find((x) => x.sid === btn.closest(".notif").dataset.sid);
    if (!n) return;
    const all = btn.closest(".notif-actions").querySelectorAll("button");
    all.forEach((b) => (b.disabled = true));
    try {
      if (btn.dataset.act === "renew") await renew(n); else await remove(n);
    } catch (err) {
      console.error(err);
      toast("صار خطأ، جرّب مرة ثانية", "error");
    } finally {
      all.forEach((b) => (b.disabled = false));
    }
  };

  unsubG = onSnapshot(
    query(collection(db, "groups"), orderBy("createdAt")),
    (snap) => { groups = snap.docs.map((d) => ({ id: d.id, ...d.data() })); nGReady = true; render(); },
    (err) => { nGReady = true; render(); console.error("groups:", err); }
  );
  unsubS = onSnapshot(
    query(collection(db, "appointments"), where("seriesId", "!=", null)),
    (snap) => { seriesDocs = snap.docs.map((d) => ({ id: d.id, ...d.data() })); sReady = true; render(); },
    (err) => { sReady = true; render(); console.error("notifications:", err); }
  );
}

export function stopNotifications() {
  if (unsubS) unsubS();
  if (unsubG) unsubG();
  unsubS = unsubG = null;
  seriesDocs = []; notifs = [];
  sReady = nGReady = false;
  started = false;
}
