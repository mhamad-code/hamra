import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAofUQEFa5ND5rMZSuscnrpqHOeBnNvwPo",
  authDomain: "mhamad--saite.firebaseapp.com",
  projectId: "mhamad--saite",
  storageBucket: "mhamad--saite.firebasestorage.app",
  messagingSenderId: "687843138359",
  appId: "1:687843138359:web:044838f8f0b0d3a7d8d8b2"
};

// الإيميل المسموح له بالدخول (لازم يطابق قواعد Firestore)
export const ALLOWED_EMAIL = "mhamra148@gmail.com";

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
