import { db } from "./app.js";
import {
  collection, doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc,
  query, orderBy, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  DIVISIONS, DEPARTMENTS, SECTIONS, TEAMS, POSITIONS, JOB_LEVELS,
  SITES, CONTRACT_TYPES, NATIONALITIES, GENDERS, EMP_STATUSES
} from "./masterdata.js";

const empCol = collection(db, "employees");

// ===== HELPERS =====
function escH(s) { return (s||"").replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function fmtDate(d) { return d ? d.substring(0,10) : "-"; }
function makeSelect(opts, val="", placeholder="-- เลือก --") {
  return `<option value="">${placeholder}</option>` + opts.map(o => {
    const v = typeof o === "string" ? o : o.code;
    const label = typeof o === "string" ? o : (o.name + (o.nameTH ? ` (${o.nameTH})` : ""));
    return `<option value="${v}" ${v===val?"selected":""}>${label}</option>`;
  }).join("");
}

// ===== STATE =====
let allEmployees = [];
let unsubEmployees = null;
let editingEmpId = null;
let empSearchTerm = "";
let empFilterDept = "";
let empFilterStatus = "Active";

// ===== RENDER EMPLOYEE PAGE =====
export function initEmployeePage() {
  const page = document.getElementById("employeesPage");
  if (!page) return;

  page.innerHTML = `
  <div style="padding:20px 28px 28px;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:12px;">
      <div>
        <div style="font-size:18px;font-weight:700;color:var(--navy);">ข้อมูลพนักงาน</div>
        <div style="font-size:12px;color:var(--muted);margin-top:2px;" id="empCount">กำลังโหลด...</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button id="empImportBtn" class="btn-secondary">📥 Import Excel</button>
        <button id="empExportBtn" class="btn-secondary">📤 Export Excel</button>
        <button id="empTemplateBtn" class="btn-secondary">📋 Download Template</button>
        <button id="empAddBtn" class="btn-primary" style="width:auto;padding:9px 16px;">+ เพิ่มพนักงาน</button>
      </div>
    </div>

    <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;">
      <input id="empSearch" class="field" placeholder="ค้นหาชื่อ / รหัส / ตำแหน่ง..." style="flex:1;min-width:200px;">
      <select id="empFilterDept" class="field" style="min-width:160px;">
        <option value="">ทุก Department</option>
        ${DEPARTMENTS.map(d=>`<option value="${d.name}">${d.name}</option>`).join("")}
      </select>
      <select id="empFilterStatus" class="field">
        <option value="">ทุกสถานะ</option>
        ${EMP_STATUSES.map(s=>`<option value="${s}" ${s==="Active"?"selected":""}>${s}</option>`).join("")}
      </select>
    </div>

    <input type="file" id="empFileInput" accept=".xlsx,.xls" style="display:none;">

    <div id="empTableWrap" style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow-sm);overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;font-size:12px;" id="empTable">
        <thead>
          <tr style="background:var(--navy);">
            ${["รหัส","ชื่อ-นามสกุล","Department","Position","Job Level","ประเภทสัญญา","วันเริ่มงาน","สถานะ",""].map(h=>`<th style="padding:10px 12px;text-align:left;color:#fff;font-weight:600;white-space:nowrap;">${h}</th>`).join("")}
          </tr>
        </thead>
        <tbody id="empTableBody"><tr><td colspan="9" style="text-align:center;padding:32px;color:var(--muted2);">กำลังโหลด...</td></tr></tbody>
      </table>
    </div>
  </div>

  <!-- Employee Form Modal -->
  <div id="empModalOverlay" class="modal-overlay" style="display:none;">
    <div class="modal-box" style="max-width:680px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;">
        <div class="modal-title" id="empModalTitle">เพิ่มพนักงานใหม่</div>
        <button onclick="document.getElementById('empModalOverlay').style.display='none'" style="background:none;border:none;cursor:pointer;font-size:18px;color:var(--muted);">✕</button>
      </div>
      <form id="empForm">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          ${empField("emp_code","รหัสพนักงาน *","text","","col2")}
          ${empField("emp_status","สถานะ","select",EMP_STATUSES)}
          ${empField("emp_firstnameTH","ชื่อ (ภาษาไทย) *")}
          ${empField("emp_lastnameTH","นามสกุล (ภาษาไทย) *")}
          ${empField("emp_firstnameEN","First Name")}
          ${empField("emp_lastnameEN","Last Name")}
          ${empField("emp_gender","เพศ","select",GENDERS)}
          ${empField("emp_nationality","สัญชาติ","select",NATIONALITIES)}
          ${empField("emp_dob","วันเกิด","date")}
          ${empField("emp_phone","เบอร์โทรศัพท์")}
          ${empField("emp_division","Division","select",DIVISIONS)}
          ${empField("emp_department","Department","select",DEPARTMENTS)}
          ${empField("emp_section","Section","select",SECTIONS)}
          ${empField("emp_team","Team","select",TEAMS)}
          ${empField("emp_position","Position","select",POSITIONS,"col2")}
          ${empField("emp_joblevel","Job Level","select",JOB_LEVELS)}
          ${empField("emp_site","Site","select",SITES)}
          ${empField("emp_contracttype","ประเภทสัญญา","select",CONTRACT_TYPES)}
          ${empField("emp_joindate","วันเริ่มงาน *","date")}
          ${empField("emp_effectivedate","Effective Date","date")}
          ${empField("emp_enddate","วันสิ้นสุดสัญญา","date")}
          ${empField("emp_salary","เงินเดือน (บาท)","number")}
          <div style="grid-column:span 2;">
            <div style="font-size:11px;color:var(--muted);font-weight:600;margin-bottom:5px;">Remark</div>
            <textarea id="emp_remark" class="field" rows="2" style="resize:vertical;"placeholder="หมายเหตุ"></textarea>
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-top:16px;">
          <button type="button" id="empDeleteBtn" class="btn-secondary" style="color:var(--red);display:none;">ลบพนักงาน</button>
          <div style="flex:1;"></div>
          <button type="button" onclick="document.getElementById('empModalOverlay').style.display='none'" class="btn-secondary">ยกเลิก</button>
          <button type="submit" class="btn-primary" style="width:auto;padding:10px 24px;">บันทึก</button>
        </div>
        <div id="empFormMsg" style="font-size:12px;margin-top:8px;min-height:14px;"></div>
      </form>
    </div>
  </div>`;

  bindEmpEvents();
  subscribeEmployees();
}

function empField(id, label, type="text", opts=[], span="") {
  let input = "";
  if (type === "select") {
    input = `<select id="${id}" class="field">${makeSelect(opts)}</select>`;
  } else if (type === "date") {
    input = `<input id="${id}" type="date" class="field">`;
  } else if (type === "number") {
    input = `<input id="${id}" type="number" class="field" placeholder="0">`;
  } else {
    input = `<input id="${id}" type="text" class="field" placeholder="${label}">`;
  }
  const spanStyle = span === "col2" ? "grid-column:span 2;" : "";
  return `<div style="${spanStyle}"><div style="font-size:11px;color:var(--muted);font-weight:600;margin-bottom:5px;">${label}</div>${input}</div>`;
}

// ===== SUBSCRIBE =====
function subscribeEmployees() {
  if (unsubEmployees) unsubEmployees();
  unsubEmployees = onSnapshot(query(empCol, orderBy("empCode")), snap => {
    allEmployees = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderEmpTable();
  });
}

function getFilteredEmps() {
  return allEmployees.filter(e => {
    if (empFilterStatus && e.status !== empFilterStatus) return false;
    if (empFilterDept && e.department !== empFilterDept) return false;
    if (empSearchTerm) {
      const hay = [e.empCode, e.firstnameTH, e.lastnameTH, e.firstnameEN, e.lastnameEN, e.position].join(" ").toLowerCase();
      if (!hay.includes(empSearchTerm.toLowerCase())) return false;
    }
    return true;
  });
}

function renderEmpTable() {
  const filtered = getFilteredEmps();
  const countEl = document.getElementById("empCount");
  if (countEl) countEl.textContent = `${filtered.length} รายการ (ทั้งหมด ${allEmployees.length} คน)`;

  const body = document.getElementById("empTableBody");
  if (!body) return;
  if (filtered.length === 0) {
    body.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:32px;color:var(--muted2);">ไม่พบพนักงานที่ตรงกับเงื่อนไข</td></tr>`;
    return;
  }
  const statusColor = { Active:"var(--teal)", Resigned:"var(--red)", Terminated:"var(--red)", Retired:"var(--muted)", Transferred:"var(--blue)" };
  const statusBg = { Active:"var(--teal-bg)", Resigned:"var(--red-bg)", Terminated:"var(--red-bg)", Retired:"var(--bg)", Transferred:"var(--blue-bg)" };
  body.innerHTML = filtered.map((e,i) => `
    <tr style="border-bottom:1px solid var(--border);${i%2===1?"background:var(--bg)":""}" class="emp-row" data-id="${e.id}">
      <td style="padding:10px 12px;font-weight:600;color:var(--blue);">${escH(e.empCode||"-")}</td>
      <td style="padding:10px 12px;font-weight:600;">${escH((e.firstnameTH||"")+" "+(e.lastnameTH||""))}<br><span style="font-size:11px;color:var(--muted2);">${escH((e.firstnameEN||"")+" "+(e.lastnameEN||""))}</span></td>
      <td style="padding:10px 12px;color:var(--muted);">${escH(e.department||"-")}</td>
      <td style="padding:10px 12px;color:var(--muted);">${escH(e.position||"-")}</td>
      <td style="padding:10px 12px;text-align:center;"><span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:4px;background:var(--bg);color:var(--muted);">${escH(e.jobLevel||"-")}</span></td>
      <td style="padding:10px 12px;color:var(--muted);">${escH(e.contractType||"-")}</td>
      <td style="padding:10px 12px;color:var(--muted);">${fmtDate(e.joinDate)}</td>
      <td style="padding:10px 12px;"><span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:12px;color:${statusColor[e.status]||"var(--muted)"};background:${statusBg[e.status]||"var(--bg)"};">${escH(e.status||"Active")}</span></td>
      <td style="padding:10px 12px;"><button class="feed-action-btn edit" data-edit="${e.id}" style="padding:4px 10px;">แก้ไข</button></td>
    </tr>`).join("");

  body.querySelectorAll("[data-edit]").forEach(btn =>
    btn.addEventListener("click", () => openEmpModal(btn.getAttribute("data-edit")))
  );
}

// ===== MODAL =====
function openEmpModal(id = null) {
  editingEmpId = id;
  const overlay = document.getElementById("empModalOverlay");
  const title = document.getElementById("empModalTitle");
  const deleteBtn = document.getElementById("empDeleteBtn");
  const msg = document.getElementById("empFormMsg");
  msg.textContent = "";

  if (id) {
    const emp = allEmployees.find(e => e.id === id);
    if (!emp) return;
    title.textContent = "แก้ไขข้อมูลพนักงาน";
    deleteBtn.style.display = "inline-block";
    fillEmpForm(emp);
  } else {
    title.textContent = "เพิ่มพนักงานใหม่";
    deleteBtn.style.display = "none";
    clearEmpForm();
  }
  overlay.style.display = "flex";
}

function fillEmpForm(e) {
  const f = id => document.getElementById(id);
  f("emp_code").value = e.empCode || "";
  f("emp_status").value = e.status || "Active";
  f("emp_firstnameTH").value = e.firstnameTH || "";
  f("emp_lastnameTH").value = e.lastnameTH || "";
  f("emp_firstnameEN").value = e.firstnameEN || "";
  f("emp_lastnameEN").value = e.lastnameEN || "";
  f("emp_gender").value = e.gender || "";
  f("emp_nationality").value = e.nationality || "";
  f("emp_dob").value = e.dob || "";
  f("emp_phone").value = e.phone || "";
  f("emp_division").value = e.division || "";
  f("emp_department").value = e.department || "";
  f("emp_section").value = e.section || "";
  f("emp_team").value = e.team || "";
  f("emp_position").value = e.position || "";
  f("emp_joblevel").value = e.jobLevel || "";
  f("emp_site").value = e.site || "";
  f("emp_contracttype").value = e.contractType || "";
  f("emp_joindate").value = e.joinDate || "";
  f("emp_effectivedate").value = e.effectiveDate || "";
  f("emp_enddate").value = e.endDate || "";
  f("emp_salary").value = e.salary || "";
  f("emp_remark").value = e.remark || "";
}

function clearEmpForm() {
  ["emp_code","emp_firstnameTH","emp_lastnameTH","emp_firstnameEN","emp_lastnameEN",
   "emp_dob","emp_phone","emp_division","emp_department","emp_section","emp_team",
   "emp_position","emp_joblevel","emp_site","emp_contracttype","emp_joindate",
   "emp_effectivedate","emp_enddate","emp_salary","emp_remark"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  const statusEl = document.getElementById("emp_status");
  if (statusEl) statusEl.value = "Active";
}

function getEmpFormData() {
  const g = id => (document.getElementById(id)||{}).value?.trim() || "";
  return {
    empCode: g("emp_code"), status: g("emp_status") || "Active",
    firstnameTH: g("emp_firstnameTH"), lastnameTH: g("emp_lastnameTH"),
    firstnameEN: g("emp_firstnameEN"), lastnameEN: g("emp_lastnameEN"),
    gender: g("emp_gender"), nationality: g("emp_nationality"),
    dob: g("emp_dob"), phone: g("emp_phone"),
    division: g("emp_division"), department: g("emp_department"),
    section: g("emp_section"), team: g("emp_team"),
    position: g("emp_position"), jobLevel: g("emp_joblevel"),
    site: g("emp_site"), contractType: g("emp_contracttype"),
    joinDate: g("emp_joindate"), effectiveDate: g("emp_effectivedate"),
    endDate: g("emp_enddate"),
    salary: g("emp_salary") ? Number(g("emp_salary")) : null,
    remark: g("emp_remark"),
  };
}

// ===== EVENTS =====
function bindEmpEvents() {
  document.getElementById("empSearch")?.addEventListener("input", e => {
    empSearchTerm = e.target.value; renderEmpTable();
  });
  document.getElementById("empFilterDept")?.addEventListener("change", e => {
    empFilterDept = e.target.value; renderEmpTable();
  });
  document.getElementById("empFilterStatus")?.addEventListener("change", e => {
    empFilterStatus = e.target.value; renderEmpTable();
  });
  document.getElementById("empAddBtn")?.addEventListener("click", () => openEmpModal(null));

  document.getElementById("empForm")?.addEventListener("submit", async ev => {
    ev.preventDefault();
    const data = getEmpFormData();
    const msg = document.getElementById("empFormMsg");
    if (!data.empCode) { msg.textContent = "กรุณากรอกรหัสพนักงาน"; msg.style.color = "var(--red)"; return; }
    if (!data.firstnameTH || !data.lastnameTH) { msg.textContent = "กรุณากรอกชื่อ-นามสกุล"; msg.style.color = "var(--red)"; return; }
    try {
      const docId = editingEmpId || data.empCode;
      await setDoc(doc(db, "employees", docId), { ...data, updatedAt: serverTimestamp() }, { merge: true });
      msg.textContent = "บันทึกสำเร็จ"; msg.style.color = "var(--teal)";
      setTimeout(() => { document.getElementById("empModalOverlay").style.display = "none"; }, 800);
    } catch (err) {
      msg.textContent = "บันทึกไม่สำเร็จ: " + err.message; msg.style.color = "var(--red)";
    }
  });

  document.getElementById("empDeleteBtn")?.addEventListener("click", async () => {
    if (!editingEmpId) return;
    const emp = allEmployees.find(e => e.id === editingEmpId);
    if (!confirm(`ลบ ${emp?.firstnameTH} ${emp?.lastnameTH} ออกจากระบบ?\n(ประวัติ Staff Movement จะยังคงอยู่)`)) return;
    try {
      await deleteDoc(doc(db, "employees", editingEmpId));
      document.getElementById("empModalOverlay").style.display = "none";
    } catch (err) {
      document.getElementById("empFormMsg").textContent = "ลบไม่สำเร็จ"; 
    }
  });

  document.getElementById("empTemplateBtn")?.addEventListener("click", downloadTemplate);
  document.getElementById("empImportBtn")?.addEventListener("click", () => document.getElementById("empFileInput").click());
  document.getElementById("empFileInput")?.addEventListener("change", handleImport);
  document.getElementById("empExportBtn")?.addEventListener("click", handleExport);
}

// ===== EXCEL TEMPLATE =====
function downloadTemplate() {
  if (!window.XLSX) { alert("กรุณารอโหลด library สักครู่"); return; }
  const headers = [
    "Employee Code*","First Name TH*","Last Name TH*","First Name EN","Last Name EN",
    "Gender","Nationality","DOB (YYYY-MM-DD)","Phone",
    "Division Code","Department Name","Section Name","Team Name","Position Name","Job Level",
    "Site","Contract Type","Join Date (YYYY-MM-DD)*","Effective Date (YYYY-MM-DD)",
    "End Date (YYYY-MM-DD)","Salary","Status","Remark"
  ];
  const example = [
    "AKR001","สมชาย","ใจดี","Somchai","Jaidee",
    "Male","Thai","1990-01-15","0812345678",
    "L1-003","Mining","Mining Operation","Mining Operation","Mining Engineer","O2",
    "Chatree","Permanent","2020-03-01","2020-03-01",
    "","45000","Active","พนักงานใหม่"
  ];
  const refSheet = [["Division Codes"], ...DIVISIONS.map(d=>[d.code, d.name])];
  const ws = XLSX.utils.aoa_to_sheet([headers, example]);
  ws["!cols"] = headers.map(()=>({wch:20}));
  const wsRef = XLSX.utils.aoa_to_sheet(refSheet);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Employees");
  XLSX.utils.book_append_sheet(wb, wsRef, "Reference");
  XLSX.writeFile(wb, "employee_import_template.xlsx");
}

// ===== IMPORT =====
async function handleImport(e) {
  const file = e.target.files[0];
  if (!file || !window.XLSX) return;
  e.target.value = "";
  const reader = new FileReader();
  reader.onload = async (ev) => {
    try {
      const wb = XLSX.read(ev.target.result, { type: "binary", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
      if (rows.length === 0) { alert("ไม่พบข้อมูลในไฟล์"); return; }

      const BATCH = 20;
      let success = 0, failed = 0;
      for (let i = 0; i < rows.length; i += BATCH) {
        const chunk = rows.slice(i, i + BATCH);
        await Promise.all(chunk.map(async row => {
          const code = String(row["Employee Code*"] || row["Employee Code"] || "").trim();
          if (!code) { failed++; return; }
          const formatDate = v => {
            if (!v) return "";
            if (v instanceof Date) return v.toISOString().substring(0,10);
            return String(v).trim();
          };
          const data = {
            empCode: code,
            firstnameTH: String(row["First Name TH*"] || row["First Name TH"] || "").trim(),
            lastnameTH: String(row["Last Name TH*"] || row["Last Name TH"] || "").trim(),
            firstnameEN: String(row["First Name EN"] || "").trim(),
            lastnameEN: String(row["Last Name EN"] || "").trim(),
            gender: String(row["Gender"] || "").trim(),
            nationality: String(row["Nationality"] || "").trim(),
            dob: formatDate(row["DOB (YYYY-MM-DD)"]),
            phone: String(row["Phone"] || "").trim(),
            division: String(row["Division Code"] || "").trim(),
            department: String(row["Department Name"] || "").trim(),
            section: String(row["Section Name"] || "").trim(),
            team: String(row["Team Name"] || "").trim(),
            position: String(row["Position Name"] || "").trim(),
            jobLevel: String(row["Job Level"] || "").trim(),
            site: String(row["Site"] || "").trim(),
            contractType: String(row["Contract Type"] || "").trim(),
            joinDate: formatDate(row["Join Date (YYYY-MM-DD)*"] || row["Join Date"]),
            effectiveDate: formatDate(row["Effective Date (YYYY-MM-DD)"] || row["Effective Date"]),
            endDate: formatDate(row["End Date (YYYY-MM-DD)"] || row["End Date"]),
            salary: Number(row["Salary"]) || null,
            status: String(row["Status"] || "Active").trim(),
            remark: String(row["Remark"] || "").trim(),
            updatedAt: serverTimestamp(),
          };
          try {
            await setDoc(doc(db, "employees", code), data, { merge: true });
            success++;
          } catch { failed++; }
        }));
      }
      alert(`Import เสร็จสิ้น\nสำเร็จ: ${success} รายการ\nไม่สำเร็จ: ${failed} รายการ`);
    } catch (err) {
      alert("อ่านไฟล์ไม่ได้: " + err.message);
    }
  };
  reader.readAsBinaryString(file);
}

// ===== EXPORT =====
function handleExport() {
  if (!window.XLSX) { alert("กรุณารอโหลด library สักครู่"); return; }
  const filtered = getFilteredEmps();
  const headers = ["Employee Code","First Name TH","Last Name TH","First Name EN","Last Name EN",
    "Gender","Nationality","DOB","Phone","Division","Department","Section","Team","Position",
    "Job Level","Site","Contract Type","Join Date","Effective Date","End Date","Salary","Status","Remark"];
  const rows = filtered.map(e => [
    e.empCode, e.firstnameTH, e.lastnameTH, e.firstnameEN, e.lastnameEN,
    e.gender, e.nationality, e.dob, e.phone, e.division, e.department,
    e.section, e.team, e.position, e.jobLevel, e.site, e.contractType,
    e.joinDate, e.effectiveDate, e.endDate, e.salary, e.status, e.remark
  ]);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws["!cols"] = headers.map(()=>({wch:18}));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Employees");
  XLSX.writeFile(wb, `employees_export_${new Date().toISOString().substring(0,10)}.xlsx`);
}

// ===== PUBLIC: get employee list for movement form =====
export function getActiveEmployees() {
  return allEmployees.filter(e => !e.status || e.status === "Active");
}
export function getEmployeeByCode(code) {
  return allEmployees.find(e => e.empCode === code);
}
