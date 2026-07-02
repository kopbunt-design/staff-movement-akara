import { firebaseApp } from "./firebase-config.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signInWithPopup, GoogleAuthProvider,
  signOut, updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

export const auth = getAuth(firebaseApp);
const googleProvider = new GoogleAuthProvider();

const loginScreen = document.getElementById("loginScreen");
const mainScreen = document.getElementById("mainScreen");
const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");
const showSignup = document.getElementById("showSignup");
const errorEl = document.getElementById("loginError");
const googleBtn = document.getElementById("googleBtn");

showSignup.addEventListener("click", (e) => {
  e.preventDefault();
  const showingSignup = signupForm.style.display !== "none";
  signupForm.style.display = showingSignup ? "none" : "flex";
  loginForm.style.display = showingSignup ? "flex" : "none";
  showSignup.textContent = showingSignup ? "สมัครใช้งาน" : "กลับไปเข้าสู่ระบบ";
  errorEl.textContent = "";
});

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorEl.textContent = "";
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    errorEl.textContent = friendlyError(err.code);
  }
});

signupForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorEl.textContent = "";
  const name = document.getElementById("signupName").value.trim();
  const email = document.getElementById("signupEmail").value.trim();
  const password = document.getElementById("signupPassword").value;
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: name });
  } catch (err) {
    errorEl.textContent = friendlyError(err.code);
  }
});

googleBtn.addEventListener("click", async () => {
  errorEl.textContent = "";
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (err) {
    errorEl.textContent = friendlyError(err.code);
  }
});

export function logout() {
  signOut(auth);
}

function friendlyError(code) {
  const map = {
    "auth/invalid-email": "อีเมลไม่ถูกต้อง",
    "auth/user-not-found": "ไม่พบบัญชีนี้",
    "auth/wrong-password": "รหัสผ่านไม่ถูกต้อง",
    "auth/invalid-credential": "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
    "auth/email-already-in-use": "อีเมลนี้ถูกใช้สมัครแล้ว",
    "auth/weak-password": "รหัสผ่านสั้นเกินไป (อย่างน้อย 6 ตัวอักษร)",
  };
  return map[code] || "เกิดข้อผิดพลาด ลองอีกครั้ง";
}

onAuthStateChanged(auth, (user) => {
  if (user) {
    loginScreen.style.display = "none";
    mainScreen.style.display = "block";
  } else {
    loginScreen.style.display = "flex";
    mainScreen.style.display = "none";
  }
});
