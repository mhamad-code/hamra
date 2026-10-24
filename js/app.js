import { initOnboarding } from "./onboarding.js?v=1792879063";
import { initExport } from "./export.js?v=1792879063";
import { initNotifications, stopNotifications } from "./notifications.js?v=1792879063";
import { initCalendar, stopCalendar } from "./calendar.js?v=1792879063";
import { auth, ALLOWED_EMAIL } from "./firebase-config.js?v=1792879063";
import {
  GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword,
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { initGroups, stopGroups } from "./groups.js?v=1792879063";
import { initAppointments, stopAppointments } from "./appointments.js?v=1792879063";
import { initRouter, refreshIcons, welcomeDialog } from "./ui.js?v=1792879063";

const $ = (id) => document.getElementById(id);

function showView(loggedIn) {
  document.documentElement.removeAttribute("data-boot");
  try { loggedIn ? localStorage.setItem("tm_in", "1") : localStorage.removeItem("tm_in"); } catch (e) {}
  $("login-view").classList.toggle("hidden", loggedIn);
  $("app-view").classList.toggle("hidden", !loggedIn);
  if (loggedIn) { initGroups(); initAppointments(); initCalendar(); initNotifications(); initExport(); initRouter(); }
  else { stopGroups(); stopAppointments(); stopCalendar(); stopNotifications(); }
  refreshIcons();
}

function welcome() {
  if (sessionStorage.getItem("welcomed")) return;
  sessionStorage.setItem("welcomed", "1");
  welcomeDialog();
}

onAuthStateChanged(auth, async (user) => {
  if (user && user.email === ALLOWED_EMAIL) {
    showView(true);
    welcome();
  } else if (user) {
    await signOut(auth);
    $("login-error").textContent = "هذا الحساب غير مسموح له بالدخول";
    showView(false);
  } else {
    showView(false);
  }
});

$("google-btn").addEventListener("click", async () => {
  $("login-error").textContent = "";
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (e) {
    if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") {
      $("login-error").textContent = "تعذّر الدخول عبر Google";
      console.error(e);
    }
  }
});

$("login-btn").addEventListener("click", async () => {
  $("login-error").textContent = "";
  try {
    await signInWithEmailAndPassword(auth, $("email").value.trim(), $("password").value);
  } catch (e) {
    $("login-error").textContent = "الإيميل أو كلمة السر غلط";
    console.error(e);
  }
});

$("logout-btn").addEventListener("click", async () => {
  sessionStorage.removeItem("welcomed");
  await signOut(auth);
});

refreshIcons();

initOnboarding();
