# Staff Movement — Akara Resources

เว็บแอปบันทึกและติดตามความเคลื่อนไหวของพนักงาน (ย้ายแผนก / เลื่อนตำแหน่ง / ลาออก / เข้าใหม่ ฯลฯ)
มีระบบล็อกอินจริง (Firebase Authentication) ฐานข้อมูลกลาง (Firestore) และแจ้งเตือนแบบเรียลไทม์
เมื่อมีใครบันทึกรายการใหม่ ทุกคนที่เปิดหน้าเว็บอยู่จะเห็นทันทีโดยไม่ต้องรีเฟรช

## ฟีเจอร์ในเวอร์ชันนี้

- ล็อกอินจริงด้วยอีเมล/รหัสผ่าน หรือ Google
- บันทึก/แสดงรายการแบบเรียลไทม์ (Firestore onSnapshot) พร้อม toast แจ้งเตือนเมื่อมีรายการใหม่
- ค้นหารายการด้วยชื่อ/แผนก/เหตุผล
- กรองตามประเภทการเคลื่อนไหว และตามเดือน
- Export CSV ของรายการที่กรองอยู่ (เปิดได้ด้วย Excel)
- กราฟแนวโน้มรายเดือน (6 เดือนล่าสุด) และกราฟสัดส่วนประเภทการเคลื่อนไหว (ใช้ Chart.js ผ่าน CDN ไม่ต้องติดตั้งอะไรเพิ่ม)
- Avatar สีไล่ตามชื่อพนักงานแต่ละคนในฟีด

- **รายงานเงินเดือนรายเดือน** กดปุ่ม "รายงานเงินเดือนรายเดือน" จะเปิดตารางสรุปของเดือนที่เลือก (อิงตามตัวกรองเดือนด้านบน หรือเดือนปัจจุบันถ้าไม่ได้เลือก) พร้อมการ์ดสรุปจำนวนแต่ละประเภทและยอดรวมเงินเดือน/อัตราใหม่ที่ระบุไว้ กด "Excel (.xlsx)" เพื่อดาวน์โหลดไฟล์ที่จัดคอลัมน์พร้อมส่งทีมเงินเดือนได้ทันที
- ฟิลด์ใหม่ในฟอร์มบันทึก: รหัสพนักงาน, เงินเดือน/อัตราใหม่, รหัสหน่วยงาน (Cost Center) — เผื่อไว้สำหรับงานคำนวณเงินเดือนและตัดงบประมาณ

- **แก้ไข/ลบรายการ** ใครบันทึกรายการไหนไว้ จะเห็นปุ่ม "แก้ไข" และ "ลบ" ใต้รายการนั้นในฟีด (คนอื่นแก้ไข/ลบรายการของคนอื่นไม่ได้ ป้องกันไว้ทั้งใน UI และ Firestore Rules) กด "ลบ" จะมีขั้นตอนยืนยันอีกครั้งก่อนลบจริง รายการที่ถูกแก้ไขจะมีป้าย "(แก้ไขแล้ว)" กำกับไว้
- **แก้ปัญหา Logout กดไม่ติด**: เปลี่ยนจาก `confirm()` (ซึ่งเบราว์เซอร์ในแอปบางตัว เช่น LINE in-app browser มักบล็อกป๊อปอัพนี้แบบเงียบๆ) มาเป็นเมนูดรอปดาวน์ของจริง กดที่ชื่อผู้ใช้มุมขวาบนแล้วเลือก "ออกจากระบบ" ได้ตรงๆ

## โครงสร้างไฟล์

```
staff-movement-app/
├── index.html
├── css/style.css
├── js/
│   ├── firebase-config.js   <- ต้องแก้ค่าตรงนี้ก่อนใช้งาน
│   ├── auth.js
│   └── app.js
├── assets/logo.png
├── firestore.rules
├── firebase.json
├── vercel.json
└── README.md
```

ไม่มีขั้นตอน build ใดๆ เป็นเว็บ static ล้วน เปิด `index.html` ตรงๆ ก็รันได้ทันทีหลังตั้งค่า Firebase

## ขั้นตอนตั้งค่า (ทำครั้งเดียว)

### 1. สร้างโปรเจกต์ Firebase
1. ไปที่ https://console.firebase.google.com
2. กด "Add project" ตั้งชื่อ เช่น `akara-staff-movement`
3. ปิด Google Analytics ได้ (ไม่จำเป็น) แล้วกด Create

### 2. เปิดใช้งาน Authentication
1. เมนูซ้าย เลือก Build > Authentication > Get started
2. แท็บ Sign-in method เปิดใช้งาน **Email/Password** และ **Google**

### 3. เปิดใช้งาน Firestore Database
1. เมนูซ้าย เลือก Build > Firestore Database > Create database
2. เลือก Production mode แล้วเลือก region ที่ใกล้ที่สุด (เช่น asia-southeast1)
3. หลังสร้างเสร็จ ไปที่แท็บ Rules แล้ววางเนื้อหาจากไฟล์ `firestore.rules` ทับของเดิม แล้วกด Publish

### 4. ลงทะเบียนเว็บแอปกับโปรเจกต์
1. หน้า Project Overview กดไอคอน `</>` (Web)
2. ตั้งชื่อแอป เช่น `staff-movement-web` แล้วกด Register app
3. คัดลอกค่า `firebaseConfig` ที่ปรากฏ
4. เปิดไฟล์ `js/firebase-config.js` แล้วแทนค่า `YOUR_API_KEY` ฯลฯ ด้วยค่าที่คัดลอกมา

### 5. (ถ้าใช้ Google Sign-in) เพิ่ม authorized domain
หลัง deploy แล้วได้โดเมนจริง (เช่น `xxx.web.app` หรือ `xxx.vercel.app`)
ไปที่ Authentication > Settings > Authorized domains > Add domain แล้วใส่โดเมนนั้น

## Deploy

### ตัวเลือก A: Firebase Hosting
```bash
npm install -g firebase-tools
firebase login
cd staff-movement-app
firebase init hosting   # เลือกโปรเจกต์ที่สร้างไว้ ตอบ "No" ตอนถามเรื่อง build/SPA rewrite
firebase deploy
```
จะได้ลิงก์ใช้งานจริงรูปแบบ `https://your-project.web.app`

### ตัวเลือก B: Vercel
```bash
npm install -g vercel
cd staff-movement-app
vercel
```
ทำตามคำถามบนหน้าจอ (เลือก framework เป็น "Other") จะได้ลิงก์ `https://your-project.vercel.app`

### ตัวเลือก C: GitHub + Vercel/Firebase auto-deploy
1. สร้าง repo บน GitHub แล้ว push โฟลเดอร์นี้ทั้งหมดเข้าไป
2. เชื่อม repo กับ Vercel (Import Project) หรือ Firebase Hosting GitHub Action
3. ทุกครั้งที่ push โค้ดใหม่ขึ้น `main` จะ deploy อัตโนมัติ

## หมายเหตุด้านความปลอดภัย
- `firestore.rules` ที่แนบมาบังคับว่าต้องล็อกอินก่อนถึงจะอ่าน/บันทึกข้อมูลได้ และห้ามแก้ไข/ลบรายการย้อนหลัง (รักษาความถูกต้องของประวัติ)
- ถ้าต้องการจำกัดให้เฉพาะอีเมลของบริษัท (เช่น `@akararesources.com`) เข้าใช้งานได้เท่านั้น แก้เงื่อนไขใน `firestore.rules` เพิ่ม `request.auth.token.email.matches('.*@akararesources[.]com')`
- ค่าใน `firebase-config.js` ไม่ใช่ความลับร้ายแรง (เป็นค่ามาตรฐานที่ฝั่ง client ใช้เชื่อมต่อ) แต่การป้องกันข้อมูลจริงๆ อยู่ที่ Firestore Rules ด้านบน

## ทดสอบก่อน deploy จริง
เปิด `index.html` ด้วย local server (ห้ามเปิดแบบ `file://` ตรงๆ เพราะ ES module จะถูกบล็อก) เช่น
```bash
npx serve staff-movement-app
```
แล้วเข้า http://localhost:3000
