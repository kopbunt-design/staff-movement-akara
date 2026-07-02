import { firebaseApp } from "./firebase-config.js";
import { auth, logout } from "./auth.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, collection, addDoc, query, orderBy, onSnapshot,
  serverTimestamp, doc, getDoc, setDoc, updateDoc, deleteDoc, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const db = getFirestore(firebaseApp);
const movementsRef = collection(db, "movements");
const salaryRef = collection(db, "movementSalary");
const q = query(movementsRef, orderBy("createdAt", "desc"));

let userRole = "user"; // จะถูกอัปเดตหลัง load role จาก Firestore

const TYPE_COLOR = {
  "Transfer": ["var(--blue)", "var(--blue-bg)", "var(--blue-text)"],
  "Promotion": ["var(--purple)", "var(--purple-bg)", "var(--purple-text)"],
  "Demotion": ["var(--red)", "var(--red-bg)", "var(--red-text)"],
  "Resignation": ["var(--red)", "var(--red-bg)", "var(--red-text)"],
  "Termination": ["var(--red)", "var(--red-bg)", "var(--red-text)"],
  "New Hire": ["var(--teal)", "var(--teal-bg)", "var(--teal-text)"],
  "Retirement": ["var(--gold)", "var(--gold-bg)", "var(--gold-text)"],
  "Secondment": ["var(--blue)", "var(--blue-bg)", "var(--blue-text)"],
};

const feedEl = document.getElementById("feed");
const kpisEl = document.getElementById("kpis");
const lastUpdatedEl = document.getElementById("lastUpdated");
const bellBadge = document.getElementById("bellBadge");
const toastHost = document.getElementById("toastHost");
const userNameLabel = document.getElementById("userNameLabel");
const userAvatar = document.getElementById("userAvatar");
const byHint = document.getElementById("byHint");
const entryForm = document.getElementById("entryForm");
const formMsg = document.getElementById("formMsg");
const searchBox = document.getElementById("searchBox");
const filterType = document.getElementById("filterType");
const filterMonth = document.getElementById("filterMonth");
const exportBtn = document.getElementById("exportBtn");
const payrollBtn = document.getElementById("payrollBtn");
const payrollReport = document.getElementById("payrollReport");
const payrollMonthLabel = document.getElementById("payrollMonthLabel");
const payrollSummaryCards = document.getElementById("payrollSummaryCards");
const payrollTable = document.getElementById("payrollTable");
const payrollClose = document.getElementById("payrollClose");
const payrollExportExcel = document.getElementById("payrollExportExcel");

let lastSeenAt = 0;
let firstSnapshot = true;
let currentUser = null;
let unsubscribeSnapshot = null;
let allEntries = [];
let trendChart = null;
let typeChart = null;

const AVATAR_PALETTE = ["#265CAA", "#1E9A7C", "#8B5CF6", "#E63329", "#E08A2B", "#0E5C49", "#5B2FB8"];
function avatarColor(name) {
  let hash = 0;
  for (let i = 0; i < (name || "").length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

function initials(name) {
  const parts = (name || "").trim().split(/\s+/);
  return ((parts[0] || "")[0] || "").toUpperCase() + ((parts[1] || "")[0] || "").toUpperCase();
}

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "เมื่อสักครู่";
  if (s < 3600) return Math.floor(s / 60) + " นาทีที่แล้ว";
  if (s < 86400) return Math.floor(s / 3600) + " ชม.ที่แล้ว";
  return Math.floor(s / 86400) + " วันที่แล้ว";
}

function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function showToast(entry) {
  const [color] = TYPE_COLOR[entry.type] || ["var(--gold)"];
  const el = document.createElement("div");
  el.className = "toast";
  el.style.borderLeft = "3px solid " + color;
  el.innerHTML = `<div class="toast-title">รายการใหม่ถูกบันทึก</div>
    <div class="toast-body">${escapeHtml(entry.name)} · ${escapeHtml(entry.type)} · โดย ${escapeHtml(entry.by || "ไม่ระบุ")}</div>`;
  toastHost.appendChild(el);
  setTimeout(() => { el.style.transition = "opacity 0.4s"; el.style.opacity = "0"; setTimeout(() => el.remove(), 400); }, 5000);
  if (window.Notification && Notification.permission === "granted") {
    try { new Notification("Staff Movement: รายการใหม่", { body: entry.name + " · " + entry.type }); } catch (e) {}
  }
}

function renderKpis(entries) {
  const counts = {};
  entries.forEach(e => counts[e.type] = (counts[e.type] || 0) + 1);
  const cards = [
    ["ทั้งหมด", entries.length, "#2563EB", "📋"],
    ["New Hire", counts["New Hire"] || 0, "#059669", "🆕"],
    ["Promotion", counts["Promotion"] || 0, "#7C3AED", "⬆️"],
    ["Resignation", counts["Resignation"] || 0, "#DC2626", "🚪"],
  ];
  kpisEl.innerHTML = cards.map(c => `
    <div class="kpi-card" style="--kpi-color:${c[2]}">
      <span class="kpi-icon">${c[3]}</span>
      <div class="kpi-label">${c[0]}</div>
      <div class="kpi-value" style="color:${c[2]}">${c[1]}</div>
    </div>`).join("");
}

function renderFeed(entries) {
  if (entries.length === 0) {
    feedEl.innerHTML = `<div class="feed-empty">ไม่พบรายการที่ตรงกับเงื่อนไข</div>`;
    return;
  }
  feedEl.innerHTML = entries.map(e => {
    const [color, bg, tcolor] = TYPE_COLOR[e.type] || ["var(--gold)", "var(--gold-bg)", "var(--gold-text)"];
    const isNew = e.createdAt > lastSeenAt;
    const initials2 = initials(e.name);
    const avColor = avatarColor(e.name);
    const isOwner = currentUser && e.createdBy === currentUser.uid;
    return `<div class="feed-item ${isNew ? "is-new" : ""}" data-id="${e.id}">
      <div class="avatar-sm" style="background:${avColor}1A; color:${avColor};">${escapeHtml(initials2)}</div>
      <div style="flex:1; min-width:0;">
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <span class="feed-name">${escapeHtml(e.name)}</span>
          ${e.empId ? `<span class="feed-empid">#${escapeHtml(e.empId)}</span>` : ""}
          <span class="feed-type" style="color:${tcolor}; background:${bg}">${escapeHtml(e.type)}</span>
          ${isNew ? '<span class="feed-new">NEW</span>' : ""}
          ${e.edited ? '<span class="feed-empid">(แก้ไขแล้ว)</span>' : ""}
        </div>
        <div class="feed-meta">${escapeHtml(e.from || "-")} &rarr; ${escapeHtml(e.to || "-")}${e.reason ? " · " + escapeHtml(e.reason) : ""}</div>
        <div class="feed-sub">บันทึกโดย ${escapeHtml(e.by || "ไม่ระบุ")} · ${timeAgo(e.createdAt)}</div>
        ${isOwner ? `<div class="feed-item-actions" data-actions-for="${e.id}">
          <button class="feed-action-btn edit" data-edit="${e.id}">แก้ไข</button>
          <button class="feed-action-btn delete" data-delete="${e.id}">ลบ</button>
        </div>` : ""}
      </div>
    </div>`;
  }).join("");

  feedEl.querySelectorAll("[data-edit]").forEach(btn => {
    btn.addEventListener("click", () => openEditModal(btn.getAttribute("data-edit")));
  });
  feedEl.querySelectorAll("[data-delete]").forEach(btn => {
    btn.addEventListener("click", () => handleDeleteClick(btn));
  });
}

function handleDeleteClick(btn) {
  const id = btn.getAttribute("data-delete");
  const actionsWrap = btn.closest(".feed-item-actions");
  if (btn.dataset.confirming === "1") {
    deleteEntry(id);
    return;
  }
  btn.dataset.confirming = "1";
  actionsWrap.innerHTML = `<span class="feed-action-confirm">ลบรายการนี้แน่ใจไหม?</span>
    <button class="feed-action-btn delete" data-delete="${id}" data-confirming="1">ยืนยันลบ</button>
    <button class="feed-action-btn edit" data-cancel-delete="1">ยกเลิก</button>`;
  actionsWrap.querySelector('[data-delete]').addEventListener("click", () => deleteEntry(id));
  actionsWrap.querySelector('[data-cancel-delete]').addEventListener("click", () => applyFiltersAndRender());
}

async function deleteEntry(id) {
  try {
    await deleteDoc(doc(db, "movements", id));
  } catch (err) {
    alert("ลบไม่สำเร็จ ลองอีกครั้ง");
  }
}

let editingId = null;
function openEditModal(id) {
  const entry = allEntries.find(e => e.id === id);
  if (!entry) return;
  editingId = id;
  document.getElementById("e_empid").value = entry.empId || "";
  document.getElementById("e_name").value = entry.name || "";
  document.getElementById("e_type").value = entry.type || "Transfer";
  document.getElementById("e_from").value = entry.from || "";
  document.getElementById("e_to").value = entry.to || "";
  document.getElementById("e_date").value = entry.date || "";
  document.getElementById("e_salary").value = entry.salary || "";
  document.getElementById("e_costcenter").value = entry.costCenter || "";
  document.getElementById("e_reason").value = entry.reason || "";
  document.getElementById("editMsg").textContent = "";
  document.getElementById("editModalOverlay").style.display = "flex";
}

document.getElementById("editCancelBtn").addEventListener("click", () => {
  document.getElementById("editModalOverlay").style.display = "none";
  editingId = null;
});

document.getElementById("editForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!editingId) return;
  const editMsg = document.getElementById("editMsg");
  const name = document.getElementById("e_name").value.trim();
  if (!name) { editMsg.textContent = "กรุณากรอกชื่อพนักงาน"; editMsg.style.color = "var(--red)"; return; }
  try {
    await updateDoc(doc(db, "movements", editingId), {
      empId: document.getElementById("e_empid").value.trim(),
      name,
      type: document.getElementById("e_type").value,
      from: document.getElementById("e_from").value.trim(),
      to: document.getElementById("e_to").value.trim(),
      date: document.getElementById("e_date").value,
      salary: document.getElementById("e_salary").value.trim(),
      costCenter: document.getElementById("e_costcenter").value.trim(),
      reason: document.getElementById("e_reason").value.trim(),
      editedAt: serverTimestamp(),
    });
    document.getElementById("editModalOverlay").style.display = "none";
    editingId = null;
  } catch (err) {
    editMsg.textContent = "บันทึกไม่สำเร็จ ลองอีกครั้ง"; editMsg.style.color = "var(--red)";
  }
});

function updateBadge(entries) {
  const unseen = entries.filter(e => e.createdAt > lastSeenAt).length;
  if (unseen > 0) {
    bellBadge.style.display = "flex";
    bellBadge.textContent = unseen > 9 ? "9+" : unseen;
  } else {
    bellBadge.style.display = "none";
  }
}

function populateMonthOptions(entries) {
  const months = new Set();
  entries.forEach(e => {
    const d = new Date(e.createdAt);
    months.add(d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"));
  });
  const sorted = Array.from(months).sort().reverse();
  const current = filterMonth.value;
  filterMonth.innerHTML = '<option value="">ทุกเดือน</option>' + sorted.map(m => {
    const [y, mo] = m.split("-");
    const label = new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString("th-TH", { month: "long", year: "numeric" });
    return `<option value="${m}">${label}</option>`;
  }).join("");
  if (sorted.includes(current)) filterMonth.value = current;
}

function getFilteredEntries() {
  const term = (searchBox.value || "").trim().toLowerCase();
  const type = filterType.value;
  const month = filterMonth.value;
  return allEntries.filter(e => {
    if (type && e.type !== type) return false;
    if (month) {
      const d = new Date(e.createdAt);
      const key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
      if (key !== month) return false;
    }
    if (term) {
      const hay = [e.empId, e.name, e.from, e.to, e.reason, e.by].join(" ").toLowerCase();
      if (!hay.includes(term)) return false;
    }
    return true;
  });
}

function renderCharts(entries) {
  const trendEl = document.getElementById("trendChart");
  const typeEl = document.getElementById("typeChart");
  if (!trendEl || !typeEl) return;

  const byMonth = {};
  entries.forEach(e => {
    const d = new Date(e.createdAt);
    const key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
    byMonth[key] = (byMonth[key] || 0) + 1;
  });
  const monthKeys = Object.keys(byMonth).sort().slice(-6);
  const maxVal = Math.max(...Object.values(byMonth), 1);

  if (monthKeys.length === 0) {
    trendEl.innerHTML = '<div style="color:var(--muted2);font-size:12px;text-align:center;padding:40px 0;">ยังไม่มีข้อมูล</div>';
  } else {
    trendEl.innerHTML = '<div style="display:flex;align-items:flex-end;gap:6px;height:110px;padding-bottom:20px;">' +
      monthKeys.map(k => {
        const [y, mo] = k.split("-");
        const label = new Date(Number(y), Number(mo)-1, 1).toLocaleDateString("th-TH", { month: "short" });
        const h = Math.max(6, Math.round((byMonth[k] / maxVal) * 80));
        return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;">
          <div style="font-size:10px;color:#265CAA;font-weight:700;">${byMonth[k]}</div>
          <div style="width:100%;height:${h}px;background:#265CAA;border-radius:4px 4px 0 0;opacity:0.85;"></div>
          <div style="font-size:9px;color:var(--muted2);white-space:nowrap;">${label}</div>
        </div>`;
      }).join("") + '</div>';
  }

  const typeCounts = {};
  entries.forEach(e => typeCounts[e.type] = (typeCounts[e.type] || 0) + 1);
  const typeColors = {
    "Transfer":"#265CAA","Promotion":"#7C3AED","Demotion":"#DC2626",
    "Resignation":"#DC2626","Termination":"#991B1B","New Hire":"#059669",
    "Retirement":"#F59E0B","Secondment":"#0891B2"
  };
  const total = entries.length;
  if (total === 0) {
    typeEl.innerHTML = '<div style="color:var(--muted2);font-size:12px;text-align:center;padding:40px 0;">ยังไม่มีข้อมูล</div>';
  } else {
    typeEl.innerHTML = '<div style="display:flex;flex-direction:column;gap:7px;">' +
      Object.entries(typeCounts).map(([type, count]) => {
        const pct = Math.round((count / total) * 100);
        const color = typeColors[type] || "#9CA3AF";
        return `<div style="display:flex;align-items:center;gap:8px;">
          <div style="font-size:11px;color:var(--muted);min-width:76px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${type}</div>
          <div style="flex:1;height:8px;background:var(--border);border-radius:4px;overflow:hidden;">
            <div style="width:${pct}%;height:100%;background:${color};border-radius:4px;"></div>
          </div>
          <div style="font-size:11px;font-weight:700;color:${color};min-width:24px;text-align:right;">${count}</div>
        </div>`;
      }).join("") + '</div>';
  }
}

function exportCSV() {
  const entries = getFilteredEntries();
  const headers = ["Employee ID", "Name", "Type", "From", "To", "Date", "Salary/Rate", "Cost Center", "Reason", "Recorded By", "Recorded At"];
  const rows = entries.map(e => [
    e.empId || "", e.name, e.type, e.from || "", e.to || "", e.date || "", e.salary || "", e.costCenter || "", e.reason || "", e.by || "",
    new Date(e.createdAt).toLocaleString("th-TH")
  ]);
  const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "staff_movement_" + new Date().toISOString().slice(0, 10) + ".csv";
  a.click();
  URL.revokeObjectURL(url);
}

function getCurrentReportMonth() {
  if (filterMonth.value) return filterMonth.value;
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}

function monthLabelTH(key) {
  const [y, mo] = key.split("-");
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString("th-TH", { month: "long", year: "numeric" });
}

function getPayrollEntries(monthKey) {
  return allEntries.filter(e => {
    const d = new Date(e.createdAt);
    const key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
    return key === monthKey;
  }).sort((a, b) => a.createdAt - b.createdAt);
}

const PAYROLL_HEADERS = ["รหัสพนักงาน", "ชื่อพนักงาน", "ประเภท", "วันที่มีผล", "แผนกเดิม", "แผนกใหม่", "เงินเดือน/อัตราใหม่", "Cost Center", "เหตุผล", "บันทึกโดย"];

function payrollRow(e) {
  return [
    e.empId || "-", e.name, e.type, e.date || "-", e.from || "-", e.to || "-",
    e.salary ? Number(e.salary).toLocaleString("th-TH") : "-", e.costCenter || "-",
    e.reason || "-", e.by || "-"
  ];
}

function renderPayrollReport() {
  const monthKey = getCurrentReportMonth();
  const entries = getPayrollEntries(monthKey);
  payrollMonthLabel.textContent = monthLabelTH(monthKey) + " · " + entries.length + " รายการ";

  const counts = {};
  let salarySum = 0;
  entries.forEach(e => { counts[e.type] = (counts[e.type] || 0) + 1; if (e.salary) salarySum += Number(e.salary) || 0; });
  const summaryItems = [
    ["ทั้งหมด", entries.length],
    ["New Hire", counts["New Hire"] || 0],
    ["Promotion", counts["Promotion"] || 0],
    ["Resignation", counts["Resignation"] || 0],
    ["Termination", counts["Termination"] || 0],
    ["รวมเงินเดือน/อัตราใหม่ที่ระบุ", salarySum ? salarySum.toLocaleString("th-TH") + " บาท" : "-"],
  ];
  payrollSummaryCards.innerHTML = summaryItems.map(s => `
    <div class="payroll-summary-card"><div class="label">${s[0]}</div><div class="value">${s[1]}</div></div>
  `).join("");

  if (entries.length === 0) {
    payrollTable.innerHTML = `<tr><td class="payroll-empty">ไม่มีรายการในเดือนนี้</td></tr>`;
    return;
  }
  payrollTable.innerHTML =
    "<thead><tr>" + PAYROLL_HEADERS.map(h => `<th>${h}</th>`).join("") + "</tr></thead>" +
    "<tbody>" + entries.map(e => "<tr>" + payrollRow(e).map(v => `<td>${escapeHtml(String(v))}</td>`).join("") + "</tr>").join("") + "</tbody>";
}

function exportPayrollExcel() {
  if (!window.XLSX) return;
  const monthKey = getCurrentReportMonth();
  const entries = getPayrollEntries(monthKey);
  const data = [PAYROLL_HEADERS, ...entries.map(payrollRow)];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!cols"] = PAYROLL_HEADERS.map(() => ({ wch: 18 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Payroll " + monthKey);
  XLSX.writeFile(wb, "payroll_report_" + monthKey + ".xlsx");
}

payrollBtn.addEventListener("click", () => {
  payrollReport.style.display = "block";
  renderPayrollReport();
  payrollReport.scrollIntoView({ behavior: "smooth", block: "start" });
});
payrollClose.addEventListener("click", () => { payrollReport.style.display = "none"; });
payrollExportExcel.addEventListener("click", exportPayrollExcel);

function applyFiltersAndRender() {
  const filtered = getFilteredEntries();
  renderFeed(filtered);
}

searchBox.addEventListener("input", applyFiltersAndRender);
filterType.addEventListener("change", applyFiltersAndRender);
filterMonth.addEventListener("change", () => {
  applyFiltersAndRender();
  if (payrollReport.style.display !== "none") renderPayrollReport();
});
exportBtn.addEventListener("click", exportCSV);

// ===== ADMIN PANEL =====
let unsubAdminUsers = null;

function loadAdminUsers() {
  const listEl = document.getElementById("adminUserList");
  listEl.innerHTML = '<div style="color:var(--muted2); font-size:13px;">กำลังโหลด...</div>';

  if (unsubAdminUsers) unsubAdminUsers();

  unsubAdminUsers = onSnapshot(collection(db, "userRoles"), (snap) => {
    if (snap.empty) {
      listEl.innerHTML = '<div style="color:var(--muted2); font-size:13px; padding:12px 0;">ยังไม่มีผู้ใช้ — รอให้ทีมล็อกอินเข้าแอปครั้งแรก ชื่อจะขึ้นอัตโนมัติ</div>';
      return;
    }
    const sorted = snap.docs.sort((a, b) => {
      const ra = a.data().role || "user";
      const rb = b.data().role || "user";
      const order = { admin: 0, hr: 1, user: 2 };
      return (order[ra] ?? 3) - (order[rb] ?? 3);
    });
    listEl.innerHTML = sorted.map(d => {
      const data = d.data();
      const role = data.role || "user";
      const roleLabel = { admin: "Admin", hr: "HR", user: "User" }[role] || "User";
      const initial = (data.name || data.email || "?")[0].toUpperCase();
      const avatarColors = { admin: "#7C3AED", hr: "#059669", user: "#265CAA" };
      const avatarBg = { admin: "#F5F3FF", hr: "#ECFDF5", user: "#EFF6FF" };
      return `<div class="admin-user-row" data-uid="${d.id}">
        <div class="avatar-sm" style="background:${avatarBg[role]||"#EFF6FF"}; color:${avatarColors[role]||"#265CAA"};">${initial}</div>
        <div style="flex:1; min-width:0;">
          <div class="admin-user-name">${escapeHtml(data.name || "ไม่ระบุ")}</div>
          <div class="admin-user-email">${escapeHtml(data.email || d.id)}</div>
        </div>
        <span class="role-badge ${role}">${roleLabel}</span>
        <select class="role-select" data-uid="${d.id}">
          <option value="user" ${role === "user" ? "selected" : ""}>User</option>
          <option value="hr" ${role === "hr" ? "selected" : ""}>HR</option>
          <option value="admin" ${role === "admin" ? "selected" : ""}>Admin</option>
        </select>
      </div>`;
    }).join("");

    listEl.querySelectorAll(".role-select").forEach(sel => {
      sel.addEventListener("change", async () => {
        const uid = sel.getAttribute("data-uid");
        await setDoc(doc(db, "userRoles", uid), { role: sel.value }, { merge: true });
      });
    });
  }, (err) => {
    listEl.innerHTML = '<div style="color:var(--red); font-size:13px;">โหลดไม่สำเร็จ ตรวจสอบ Firestore Rules</div>';
  });
}
document.getElementById("adminRefreshBtn").addEventListener("click", loadAdminUsers);

document.getElementById("addUserBtn").addEventListener("click", async () => {
  const name = document.getElementById("newUserName").value.trim();
  const email = document.getElementById("newUserEmail").value.trim();
  const role = document.getElementById("newUserRole").value;
  const msgEl = document.getElementById("addUserMsg");
  if (!name || !email) { msgEl.textContent = "กรุณากรอกชื่อและอีเมล"; msgEl.style.color = "var(--red)"; return; }
  try {
    const pendingRef = doc(db, "pendingRoles", email.toLowerCase().replace(/[.#$[\]]/g, "_"));
    await setDoc(pendingRef, { name, email, role, createdAt: serverTimestamp(), createdBy: currentUser.uid });
    msgEl.textContent = "เพิ่มสำเร็จ — ส่งลิงก์ให้เขาสมัคร/ล็อกอินได้เลย"; msgEl.style.color = "var(--teal)";
    document.getElementById("newUserName").value = "";
    document.getElementById("newUserEmail").value = "";
    setTimeout(() => { msgEl.textContent = ""; }, 4000);
  } catch (err) {
    msgEl.textContent = "เพิ่มไม่สำเร็จ ลองอีกครั้ง"; msgEl.style.color = "var(--red)";
  }
});

// บันทึกข้อมูล user ลง userRoles เมื่อล็อกอินครั้งแรก (เพื่อให้ admin เห็นรายชื่อ)
async function registerUserProfile(user) {
  const ref = doc(db, "userRoles", user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    // เช็คว่า admin เคยกำหนดสิทธิ์ไว้ล่วงหน้าด้วยอีเมลนี้ไหม
    let role = "user";
    try {
      const emailKey = (user.email || "").toLowerCase().replace(/[.#$[\]]/g, "_");
      const pendingRef = doc(db, "pendingRoles", emailKey);
      const pendingSnap = await getDoc(pendingRef);
      if (pendingSnap.exists()) {
        role = pendingSnap.data().role || "user";
        await deleteDoc(pendingRef); // ลบ pending หลังนำไปใช้แล้ว
      }
    } catch (e) {}
    await setDoc(ref, {
      name: user.displayName || user.email.split("@")[0],
      email: user.email,
      role,
      createdAt: serverTimestamp(),
    });
  } else {
    await setDoc(ref, { name: user.displayName || user.email.split("@")[0], email: user.email }, { merge: true });
  }
}


function attachListener() {
  if (unsubscribeSnapshot) unsubscribeSnapshot();
  unsubscribeSnapshot = onSnapshot(q, async (snapshot) => {
    const entries = snapshot.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        empId: data.empId || "", name: data.name, type: data.type, from: data.from, to: data.to,
        date: data.date, reason: data.reason, by: data.by, createdBy: data.createdBy || "",
        edited: !!data.editedAt,
        createdAt: data.createdAt && data.createdAt.toMillis ? data.createdAt.toMillis() : Date.now(),
      };
    });

    // โหลดข้อมูลเงินเดือนเฉพาะ HR/Admin
    if (userRole === "hr" || userRole === "admin") {
      try {
        const salarySnap = await getDocs(salaryRef);
        const salaryMap = {};
        salarySnap.forEach(d => { salaryMap[d.id] = d.data(); });
        entries.forEach(e => {
          const s = salaryMap[e.id] || {};
          e.salary = s.salary || "";
          e.costCenter = s.costCenter || "";
        });
      } catch (err) { /* ถ้าไม่มีสิทธิ์จะ skip ไปเลย */ }
    }

    if (!firstSnapshot) {
      snapshot.docChanges().forEach(change => {
        if (change.type === "added") {
          const data = change.doc.data();
          const createdAt = data.createdAt && data.createdAt.toMillis ? data.createdAt.toMillis() : Date.now();
          if (data.by !== (currentUser.displayName || currentUser.email) && createdAt > lastSeenAt - 2000) {
            showToast({ name: data.name, type: data.type, by: data.by });
          }
        }
      });
    }

    allEntries = entries;
    renderKpis(entries);
    populateMonthOptions(entries);
    applyFiltersAndRender();
    renderCharts(entries);
    if (payrollReport.style.display !== "none") renderPayrollReport();
    updateBadge(entries);
    lastUpdatedEl.textContent = "อัปเดตล่าสุด " + new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
    firstSnapshot = false;
  });
}

async function loadLastSeen(uid) {
  try {
    const ref = doc(db, "userPrefs", uid);
    const snap = await getDoc(ref);
    lastSeenAt = snap.exists() ? (snap.data().lastSeenAt || 0) : 0;
  } catch (e) { lastSeenAt = 0; }
}

document.getElementById("bellWrap").addEventListener("click", async () => {
  lastSeenAt = Date.now();
  bellBadge.style.display = "none";
  if (currentUser) {
    try { await setDoc(doc(db, "userPrefs", currentUser.uid), { lastSeenAt }); } catch (e) {}
  }
});

document.getElementById("userChip").addEventListener("click", (e) => {
  e.stopPropagation();
  const menu = document.getElementById("userMenu");
  menu.style.display = menu.style.display === "none" ? "block" : "none";
});
document.addEventListener("click", () => {
  document.getElementById("userMenu").style.display = "none";
});
document.getElementById("logoutBtn").addEventListener("click", (e) => {
  e.stopPropagation();
  if (unsubscribeSnapshot) { unsubscribeSnapshot(); unsubscribeSnapshot = null; }
  logout();
});

entryForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const empId = document.getElementById("f_empid").value.trim();
  const name = document.getElementById("f_name").value.trim();
  const type = document.getElementById("f_type").value;
  const from = document.getElementById("f_from").value.trim();
  const to = document.getElementById("f_to").value.trim();
  const date = document.getElementById("f_date").value;
  const salary = document.getElementById("f_salary").value.trim();
  const costCenter = document.getElementById("f_costcenter").value.trim();
  const reason = document.getElementById("f_reason").value.trim();
  if (!name) { formMsg.textContent = "กรุณากรอกชื่อพนักงาน"; formMsg.style.color = "var(--red)"; return; }
  try {
    const docRef = await addDoc(movementsRef, {
      empId, name, type, from, to, date, reason,
      by: currentUser.displayName || currentUser.email,
      createdBy: currentUser.uid,
      createdAt: serverTimestamp(),
    });
    // บันทึกเงินเดือนแยก collection เฉพาะถ้ามีสิทธิ์และกรอกข้อมูล
    if ((userRole === "hr" || userRole === "admin") && (salary || costCenter)) {
      await setDoc(doc(db, "movementSalary", docRef.id), {
        salary, costCenter, createdBy: currentUser.uid, createdAt: serverTimestamp(),
      });
    }
    formMsg.textContent = "บันทึกสำเร็จ"; formMsg.style.color = "var(--teal)";
    ["f_empid", "f_name", "f_from", "f_to", "f_date", "f_salary", "f_costcenter", "f_reason"].forEach(id => document.getElementById(id).value = "");
    setTimeout(() => { formMsg.textContent = ""; }, 2500);
  } catch (err) {
    formMsg.textContent = "บันทึกไม่สำเร็จ ลองอีกครั้ง"; formMsg.style.color = "var(--red)";
  }
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    if (unsubscribeSnapshot) unsubscribeSnapshot();
    return;
  }
  currentUser = user;
  const displayName = user.displayName || user.email.split("@")[0];
  userNameLabel.textContent = displayName;
  userAvatar.textContent = initials(displayName);
  byHint.textContent = displayName;

  // บันทึก profile ลง userRoles (ครั้งแรก)
  await registerUserProfile(user);

  // โหลด role ของ user คนนี้จาก Firestore
  try {
    const roleSnap = await getDoc(doc(db, "userRoles", user.uid));
    userRole = roleSnap.exists() ? (roleSnap.data().role || "user") : "user";
  } catch (e) { userRole = "user"; }

  // แสดง/ซ่อน salary fields ตาม role
  const salaryFields = document.getElementById("salaryFields");
  const payrollBtnEl = document.getElementById("payrollBtn");
  const adminTabEl = document.getElementById("adminTab");
  if (userRole === "hr" || userRole === "admin") {
    salaryFields.style.display = "flex";
    payrollBtnEl.style.display = "inline-block";
    if (userRole === "admin") { adminTabEl.style.display = "block"; loadAdminUsers(); }
  } else {
    salaryFields.style.display = "none";
    payrollBtnEl.style.display = "none";
    adminTabEl.style.display = "none";
  }

  firstSnapshot = true;
  await loadLastSeen(user.uid);
  attachListener();

  if (window.Notification && Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }
});
