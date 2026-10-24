import { refreshIcons } from "./ui.js?v=1792879063";

const KEY = "tm_onb";
const $ = (id) => document.getElementById(id);

const SLIDES = [
  { icon: "calendar-check", title: "أهلاً أستاذ محمود",
    text: "هذا تطبيقك الخاص لإدارة حصصك ومواعيدك بمكان واحد، بسهولة وبدون ورق." },
  { icon: "users", title: "مجموعاتك ودروسك", text: "نظّم شغلك بالشكل اللي بتحبه:",
    points: [
      ["palette", "مجموعة بلون خاص لكل صف (بكلوريا علمي، تاسع...)"],
      ["user", "درس لمجموعة أو لطالب فردي"],
      ["user-round", "مواعيدك الخاصة غير الدروس"]
    ] },
  { icon: "repeat", title: "مواعيد متكررة", text: "حدّد الأيام مرة وحدة والباقي علينا:",
    points: [
      ["calendar-days", "اختر أيام الأسبوع وعدد المرات أو تاريخ النهاية"],
      ["layers", "كل سلسلة ببطاقة وحدة، وبتفتحها لتشوف كل التواريخ"],
      ["pencil", "عدّل أو احذف موعد واحد أو السلسلة كاملة"]
    ] },
  { icon: "bell-ring", title: "أدوات بتسهّل شغلك", text: "التطبيق بيتابع عنك:",
    points: [
      ["triangle-alert", "تنبيه إذا موعدين تعارضوا"],
      ["refresh-cw", "إشعار لما تنتهي سلسلة، وتجديدها بضغطة"],
      ["timer", "لوحة اليوم مع عدّ تنازلي للدرس الجاي"],
      ["file-down", "تصدير كل مواعيدك بملف PDF مرتب"]
    ] },
  { icon: "rocket", title: "جاهز نبدأ؟", last: true,
    text: "بياناتك محفوظة بأمان ومتزامنة على كل أجهزتك. يلا نبدأ!" }
];

let idx = 0, deferred = null;

const isStandalone = () =>
  matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const seen = () => { try { return localStorage.getItem(KEY) === "1"; } catch (e) { return false; } };
const mark = () => { try { localStorage.setItem(KEY, "1"); } catch (e) {} };

function draw(dir) {
  const root = $("onboarding");
  const s = SLIDES[idx], last = !!s.last;

  const points = s.points ? `<ul class="onb-points glass">${
    s.points.map(([i, t]) => `<li><i data-lucide="${i}"></i><span>${t}</span></li>`).join("")}</ul>` : "";

  let extra = "";
  if (last && !isStandalone()) {
    if (deferred) extra = `<button type="button" class="onb-install ghost" data-a="install"><i data-lucide="download"></i>تثبيت التطبيق على الشاشة الرئيسية</button>`;
    else if (isIos()) extra = `<p class="onb-hint"><i data-lucide="share"></i>للتثبيت: اضغط زر المشاركة ثم «إضافة إلى الشاشة الرئيسية»</p>`;
  }

  root.innerHTML = `
    <div class="onb-blobs"><span></span><span></span><span></span></div>
    <div class="onb-top">
      <span class="onb-count">${idx + 1} / ${SLIDES.length}</span>
      ${last ? "" : `<button type="button" class="onb-skip" data-a="skip">تخطي</button>`}
    </div>
    <div class="onb-slide ${dir}">
      <div class="onb-ic"><i data-lucide="${s.icon}"></i></div>
      <h2>${s.title}</h2>
      <p>${s.text}</p>
      ${points}${extra}
    </div>
    <div class="onb-dots">${SLIDES.map((_, i) => `<i class="${i === idx ? "on" : ""}"></i>`).join("")}</div>
    <div class="onb-actions">
      <button type="button" data-a="next">${last ? "ابدأ الآن" : "التالي"}<i data-lucide="${last ? "check" : "arrow-left"}"></i></button>
      ${idx > 0 ? `<button type="button" class="ghost" data-a="prev"><i data-lucide="arrow-right"></i>السابق</button>` : ""}
    </div>`;
  refreshIcons();
}

function open() {
  const root = $("onboarding");
  if (!root) return;
  idx = 0;
  root.classList.remove("hidden");
  draw("fwd");
  document.body.style.overflow = "hidden";
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add("show")));
}

function close() {
  const root = $("onboarding");
  mark();
  root.classList.remove("show");
  document.body.style.overflow = "";
  setTimeout(() => { root.classList.add("hidden"); root.innerHTML = ""; }, 300);
}

async function install() {
  if (!deferred) return;
  deferred.prompt();
  try { await deferred.userChoice; } catch (e) {}
  deferred = null;
  syncChip();
  const b = document.querySelector("#onboarding .onb-install");
  if (b) b.remove();
}

function syncChip() {
  const chip = $("install-btn"), hint = $("ios-hint");
  if (chip) chip.classList.toggle("hidden", !(deferred && !isStandalone()));
  if (hint) hint.classList.toggle("hidden", !(isIos() && !isStandalone() && !deferred));
}

export function initOnboarding() {
  const root = $("onboarding");
  if (!root) return;

  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e; syncChip(); });
  window.addEventListener("appinstalled", () => { deferred = null; syncChip(); });

  root.onclick = (e) => {
    const b = e.target.closest("[data-a]");
    if (!b) return;
    const a = b.dataset.a;
    if (a === "next") { if (idx < SLIDES.length - 1) { idx++; draw("fwd"); } else close(); }
    else if (a === "prev") { if (idx > 0) { idx--; draw("back"); } }
    else if (a === "skip") close();
    else if (a === "install") install();
  };

  // سحب بالإصبع: يمين = التالي، يسار = السابق (اتجاه عربي)
  let x0 = null;
  root.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  root.addEventListener("touchend", (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    x0 = null;
    if (Math.abs(dx) < 60) return;
    if (dx > 0 && idx < SLIDES.length - 1) { idx++; draw("fwd"); }
    else if (dx < 0 && idx > 0) { idx--; draw("back"); }
  }, { passive: true });

  const info = $("info-btn"), chip = $("install-btn");
  if (info) info.onclick = open;
  if (chip) chip.onclick = install;
  syncChip();

  const force = new URLSearchParams(location.search).has("onboarding");
  if (force || (isStandalone() && !seen())) open();
}
