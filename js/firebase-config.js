// ============================================================
// 1) ไปที่ https://console.firebase.google.com -> สร้างโปรเจกต์ใหม่
// 2) ในโปรเจกต์ ไปที่ Project settings -> General -> Your apps -> Web app (</>)
// 3) คัดลอกค่า firebaseConfig ที่ได้มาใส่แทนค่าด้านล่างทั้งหมด
// 4) เปิดใช้งาน Authentication -> Sign-in method -> Email/Password และ Google
// 5) เปิดใช้งาน Firestore Database -> สร้างฐานข้อมูล (เริ่มที่ production mode)
//    แล้วนำไฟล์ firestore.rules ไปตั้งค่าใน Firestore -> Rules
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";

export const firebaseConfig = {
  apiKey: "AIzaSyAOD_q-wWJMWodKX_UPi7xsVWGH3hGudQQ",
  authDomain: "akara-staff-movement.firebaseapp.com",
  projectId: "akara-staff-movement",
  storageBucket: "akara-staff-movement.firebasestorage.app",
  messagingSenderId: "169381503852",
  appId: "1:169381503852:web:18cb79c33bfb8205840949",
  measurementId: "G-5ZNF421B1Y"
};

export const firebaseApp = initializeApp(firebaseConfig);
