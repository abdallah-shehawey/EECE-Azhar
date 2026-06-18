/* ═══════════════════════════════════════════════════════════
   EECE-Azhar — Account, Submission Portal & Admin Approvals
   Loaded as an ES module (type="module").
   Firebase Auth (Google) + Realtime Database.

   Flow:
     • Any signed-in user can submit student/project data.
     • Submissions land in /pending (NOT live).
     • Only ADMIN_EMAIL sees the Approvals panel and can publish
       a record to /students or /projects (then it shows on the site).
   The public site keeps reading /students and /projects (public read).
═══════════════════════════════════════════════════════════ */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getDatabase,
  ref,
  push,
  set,
  remove,
  get,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

/* ════════════════════════════════════════════
   § 0 — CONFIG
════════════════════════════════════════════ */
// Only this account can approve submissions.
const ADMIN_EMAIL = "shehawey9@gmail.com";

// Cloudflare R2 public base (same bucket the main site reads photos from).
const R2_BASE = "https://pub-ce440e8089f54fd1b94098e019b0b3dd.r2.dev";

// Firebase web config (apiKey for a web app is NOT a secret — safe to ship).
const firebaseConfig = {
  apiKey: "AIzaSyCvR7PmDavZsOgEdDcBQRcmIBvb1tgVP88",
  authDomain: "eece-azhar-6f18d.firebaseapp.com",
  databaseURL: "https://eece-azhar-6f18d-default-rtdb.firebaseio.com",
  projectId: "eece-azhar-6f18d",
  storageBucket: "eece-azhar-6f18d.firebasestorage.app",
  messagingSenderId: "372393686015",
  appId: "1:372393686015:web:29e5ebc6bc99a8c151adca",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
const provider = new GoogleAuthProvider();

let currentUser = null;
let isAdmin = false;
let pendingCache = {}; // id → entry (so Approve/Reject can read the data)
let myProfile = null;  // the signed-in user's /profiles/{uid} record (or null)
let adminAddMode = false; // admin is adding someone else directly (not editing self)
let editMode = false;     // user explicitly chose to edit their existing profile

/* ════════════════════════════════════════════
   § 0.1 — INSTITUTION DATA (for the profile form selects)
   The site is for students across universities. These are common Egyptian
   universities / faculties / departments; users can always pick "Other…".
════════════════════════════════════════════ */
const UNIVERSITIES = [
  "Al-Azhar University",
  "Cairo University",
  "Ain Shams University",
  "Alexandria University",
  "Mansoura University",
  "Helwan University",
  "Zagazig University",
  "Assiut University",
  "Tanta University",
  "Benha University",
  "Menoufia University",
  "Suez Canal University",
  "South Valley University",
  "Fayoum University",
  "Beni-Suef University",
  "Kafr El-Sheikh University",
  "Damietta University",
  "Aswan University",
  "Minia University",
  "Sohag University",
  "Port Said University",
  "The British University in Egypt (BUE)",
  "German University in Cairo (GUC)",
  "American University in Cairo (AUC)",
  "Nile University",
  "Misr University for Science & Technology (MUST)",
  "Future University in Egypt (FUE)",
  "October 6 University",
  "Egyptian Russian University",
];
// Engineering-only — this site is for engineering students.
const FACULTIES = [
  "Faculty of Engineering",
  "Faculty of Engineering & Technology",
  "Faculty of Computers & Artificial Intelligence",
  "Faculty of Computers & Information",
  "Faculty of Computer Engineering",
  "Higher Institute of Engineering",
];
const DEPARTMENTS = [
  "Communication & Electronics",
  "Computer Engineering",
  "Electrical Power & Machines",
  "Mechanical Engineering",
  "Civil Engineering",
  "Architecture Engineering",
  "Mechatronics Engineering",
  "Biomedical Engineering",
  "Chemical Engineering",
  "Computer Science",
  "Information Systems",
  "Artificial Intelligence",
  "Software Engineering",
];

// Broad engineering skills, grouped into categories for an easy-to-scan menu.
// Users can also add custom skills (they then appear under "Other" for everyone).
const SKILL_CATEGORIES = {
  "Programming Languages": [
    "C", "C++", "Python", "Java", "JavaScript", "TypeScript", "C#", "Go", "Rust",
    "MATLAB", "Bash/Shell", "Assembly", "SQL",
  ],
  "Embedded & Hardware": [
    "Embedded C", "Microcontrollers (AVR)", "STM32 / ARM Cortex", "ESP32 / ESP8266",
    "Arduino", "Raspberry Pi", "RTOS / FreeRTOS", "Device Drivers", "AUTOSAR",
    "CAN / LIN", "I2C / SPI / UART", "PCB Design", "Altium Designer", "KiCad",
    "Proteus", "Soldering", "Oscilloscope / Logic Analyzer",
  ],
  "Digital Design & Verification": [
    "VHDL", "Verilog", "SystemVerilog", "Digital Design (RTL)", "FPGA",
    "Xilinx Vivado", "ASIC Design", "UVM", "Static Timing Analysis",
    "Synthesis", "Cadence", "Synopsys",
  ],
  "Networking & Systems": [
    "Computer Networks", "TCP/IP", "Cisco / CCNA", "Network Security",
    "Linux", "Linux Kernel", "Docker", "Kubernetes", "CI/CD", "Git", "Ansible",
    "AWS", "Azure", "Google Cloud", "DevOps",
  ],
  "Software & Web": [
    "Data Structures & Algorithms", "OOP", "Design Patterns", "REST APIs",
    "React", "Node.js", "Flutter", "Android", "Databases", "MongoDB", "Firebase",
  ],
  "AI & Data": [
    "Machine Learning", "Deep Learning", "Computer Vision", "NLP",
    "TensorFlow", "PyTorch", "OpenCV", "Data Analysis", "Pandas / NumPy",
  ],
  "Signal & Communications": [
    "Signal Processing (DSP)", "Communication Systems", "RF Engineering",
    "Antenna Design", "Image Processing", "Control Systems",
  ],
  "Power & Mechatronics": [
    "Power Electronics", "Electrical Machines", "PLC", "SCADA",
    "Robotics", "ROS", "CAD / SolidWorks", "Simulink",
  ],
  "Tools & Soft Skills": [
    "Project Management", "Technical Writing", "Problem Solving", "Teamwork",
    "Presentation Skills",
  ],
};

/* ════════════════════════════════════════════
   § 1 — SMALL HELPERS
════════════════════════════════════════════ */
const $ = (id) => document.getElementById(id);

/**
 * Populate a <select> with options + an "Other…" entry that reveals a free-text
 * input (the element id is read from the select's data-other attribute).
 * Keeps things DRY across the 6 hierarchy selects (student + project forms).
 */
function fillSelectWithOther(selectId, values, { selected = "" } = {}) {
  const sel = $(selectId);
  if (!sel) return;
  const otherId = sel.dataset.other;
  const known = values.includes(selected);
  sel.innerHTML =
    `<option value="" disabled${selected ? "" : " selected"}>Select…</option>` +
    values.map((v) => `<option value="${v}"${v === selected ? " selected" : ""}>${v}</option>`).join("") +
    `<option value="__other"${selected && !known ? " selected" : ""}>Other…</option>`;
  if (otherId) {
    const other = $(otherId);
    if (other) {
      // If the saved value isn't in the list, show it in the "other" box.
      if (selected && !known) { other.value = selected; other.classList.remove("hidden"); }
      else { other.value = ""; other.classList.add("hidden"); }
      // Use onchange (idempotent — re-running this won't stack listeners).
      sel.onchange = () => {
        if (sel.value === "__other") { other.classList.remove("hidden"); other.focus(); }
        else other.classList.add("hidden");
      };
    }
  }
}

/** Read a hierarchy select that may use the "Other…" free-text fallback. */
function readSelectWithOther(selectId) {
  const sel = $(selectId);
  if (!sel) return "";
  if (sel.value === "__other") {
    const other = sel.dataset.other ? $(sel.dataset.other) : null;
    return other ? other.value.trim() : "";
  }
  return sel.value || "";
}

/** Fill every hierarchy select in both the student and project forms. */
function populateInstitutionSelects(profile) {
  const p = profile || {};
  fillSelectWithOther("inputUniversity", UNIVERSITIES, { selected: p.university || "" });
  fillSelectWithOther("inputFaculty", FACULTIES, { selected: p.faculty || "" });
  fillSelectWithOther("inputDepartment", DEPARTMENTS, { selected: p.department || "" });
  fillSelectWithOther("pjUniversity", UNIVERSITIES, { selected: "" });
  fillSelectWithOther("pjFaculty", FACULTIES, { selected: "" });
  fillSelectWithOther("pjDepartment", DEPARTMENTS, { selected: "" });
}

/** Sanitize a string to be a valid Firebase key (mirrors the old server). */
function sanitizeKey(str) {
  return String(str).replace(/[\.\$\#\[\]\/\s]/g, "");
}

function sanitiseFileName(original) {
  const ext = original.split(".").pop().toLowerCase();
  const base = original.slice(0, original.lastIndexOf("."));
  const clean = base
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9_\-]/g, "");
  return `${clean || "photo"}.${ext}`;
}

/** Fire an admin notification email (best-effort — never blocks the user). */
async function notifyAdmin(payload) {
  try {
    await fetch("/api/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    // Non-fatal: the submission already succeeded; the email is just a bonus.
    console.warn("notifyAdmin failed:", e.message);
  }
}

/* ════════════════════════════════════════════
   § 2 — AUTH (Google sign-in / out)
════════════════════════════════════════════ */
async function login() {
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    console.error("Sign-in failed:", err);
    if (err.code !== "auth/popup-closed-by-user" && err.code !== "auth/cancelled-popup-request") {
      alert("Sign-in failed: " + (err.message || err.code));
    }
  }
}

function logout() {
  signOut(auth).catch((e) => console.error("Sign-out failed:", e));
}

/* — Account dropdown menu — */
function openUserMenu() {
  const chip = $("userChip");
  const dd = $("userDropdown");
  if (!chip || !dd) return;
  dd.classList.add("open");
  chip.setAttribute("aria-expanded", "true");
}
function closeUserMenu() {
  const chip = $("userChip");
  const dd = $("userDropdown");
  if (!chip || !dd) return;
  dd.classList.remove("open");
  chip.setAttribute("aria-expanded", "false");
}
function toggleUserMenu() {
  const dd = $("userDropdown");
  if (!dd) return;
  dd.classList.contains("open") ? closeUserMenu() : openUserMenu();
}

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  isAdmin = !!user && user.email === ADMIN_EMAIL;
  window.__isAdmin = isAdmin; // so script.js can render admin-only controls
  myProfile = null;
  // Re-render the yearbook so admin delete buttons appear/disappear.
  if (typeof window.applyFilters === "function" && document.body.dataset.mode === "yearbook") {
    window.applyFilters();
  }
  if (user) {
    // Load this account's profile so the form acts as create vs edit.
    try {
      const snap = await get(ref(db, `profiles/${user.uid}`));
      myProfile = snap.exists() ? snap.val() : null;
    } catch (e) {
      console.warn("Could not load profile:", e.message);
    }
    // No /profiles entry yet? If an existing yearbook card carries this user's
    // Gmail (assigned by the admin in Firebase), adopt it SILENTLY as their
    // live profile — as if they'd registered it themselves — and persist the
    // link (ownerUid) so it sticks. Brand-new users just create a profile.
    if (!myProfile) {
      const card = findClaimableCard(user.email, user.displayName);
      if (card) {
        myProfile = { ...profileFromLegacy(card), status: "live", email: user.email, uid: user.uid };
        try {
          await set(ref(db, `profiles/${user.uid}`), {
            ...myProfile,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
          // Tag the legacy card with the owner so it isn't matched again / dupes.
          if (card.ownerUid !== user.uid) {
            await set(ref(db, `students/${sanitizeKey(card.name)}/ownerUid`), user.uid);
          }
          if (typeof window.fetchFirebaseData === "function") window.fetchFirebaseData();
        } catch (e) {
          console.warn("Auto-link card failed:", e.message);
        }
      }
    }
  }
  updateAuthUI();
  hydrateProfileForm();
  // If admin is already viewing the Approvals panel, refresh it.
  if (isAdmin && document.body.dataset.mode === "admin") loadPending();
});

/**
 * Find an existing, unclaimed (no ownerUid) yearbook card that belongs to this
 * account. You assign each current student their fixed Gmail in the Firebase
 * /students/{key}/email field; when they sign in with that Gmail we match it
 * here so their profile links to their existing card automatically.
 * Matches by email first (reliable), then by display name as a fallback.
 */
function findClaimableCard(email, name) {
  if (!Array.isArray(window.STUDENTS)) return null;
  const norm = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
  const e = norm(email);
  if (e) {
    const byEmail = window.STUDENTS.find((s) => !s.ownerUid && norm(s.email) === e);
    if (byEmail) return byEmail;
  }
  const n = norm(name);
  if (n) {
    const byName = window.STUDENTS.find((s) => !s.ownerUid && norm(s.name) === n);
    if (byName) return byName;
  }
  return null;
}

/** Build a myProfile-shaped object from a legacy /students record (for claiming). */
function profileFromLegacy(rec) {
  return {
    name: rec.name,
    gender: rec.gender || "",
    photo: rec.photo && rec.photo.startsWith("http") ? rec.photo.split("/").pop() : (rec.photo || ""),
    tracks: rec.track || [],
    skills: rec.skills || [],
    color: rec.color || "",
    university: rec.university || "",
    faculty: rec.faculty || "",
    department: rec.department || "",
    classYear: rec.classYear || "",
    social: rec.social || {},
    status: "claim", // sentinel: not yet a real profile
  };
}

/**
 * Fill the profile form from myProfile (edit mode) or reset it (create mode),
 * and update the heading / submit-button copy + any status badge.
 */
function hydrateProfileForm() {
  const form = $("submissionForm");
  if (!form) return;

  const titleEl = $("portalSubmitTitle");
  const subEl = $("portalSubmitSubtitle");
  const btnLabel = $("btnGenerate")?.querySelector(".btn-label");
  const badge = $("profileStatusBadge");
  const typeToggle = document.querySelector(".type-toggle-container");

  // Admin "add someone directly" mode — blank form, writes live, no approval.
  if (adminAddMode) {
    populateInstitutionSelects(null);
    if (typeof window._setSelectedTracks === "function") window._setSelectedTracks([]);
    if (titleEl) titleEl.textContent = "Add a student";
    if (subEl) subEl.textContent = "Admin: this student goes live on the site immediately.";
    if (btnLabel) btnLabel.textContent = "➕ Add student (live)";
    if (badge) badge.style.display = "none";
    if (typeToggle) typeToggle.style.display = "none"; // students only here
    const ts = $("typeStudent"); if (ts) ts.checked = true;
    return;
  }
  if (typeToggle) typeToggle.style.display = "";

  // Existing profile + not actively editing → show the read-only view card.
  const profileView = $("profileView");
  const formWrap = $("submitFormWrap");
  if (myProfile && !editMode) {
    renderProfileView();
    if (profileView) profileView.style.display = "block";
    if (formWrap) formWrap.style.display = "none";
    return;
  }
  if (profileView) profileView.style.display = "none";
  if (formWrap && currentUser) formWrap.style.display = "block";

  populateInstitutionSelects(myProfile);

  if (myProfile) {
    // Edit mode — prefill student fields.
    if ($("inputName")) $("inputName").value = myProfile.name || "";
    if ($("inputGender")) $("inputGender").value = myProfile.gender || "";
    if ($("inputClassYear") && myProfile.classYear) $("inputClassYear").value = myProfile.classYear;
    const soc = myProfile.social || {};
    if ($("inputLinkedin")) $("inputLinkedin").value = soc.linkedin || "";
    if ($("inputGithub")) $("inputGithub").value = soc.github || "";
    if ($("inputWhatsapp")) $("inputWhatsapp").value = soc.whatsapp || "";
    if ($("inputFacebook")) $("inputFacebook").value = soc.facebook || "";
    // Tracks + skills
    prefillTracks(myProfile.tracks || myProfile.track || []);
    if (typeof window._setSelectedSkills === "function") window._setSelectedSkills(myProfile.skills || []);
    // Existing photo preview
    if (myProfile.photo) showExistingPhoto(myProfile.photo);

    const live = myProfile.status === "live";
    if (titleEl) titleEl.textContent = "Your Profile";
    if (subEl) subEl.textContent = live
      ? "Edit your details below — changes appear on the site instantly."
      : "Your profile is awaiting admin approval. You can still edit it.";
    if (btnLabel) btnLabel.textContent = live ? "💾 Save changes" : "💾 Update submission";
    if (badge) {
      badge.style.display = "";
      badge.textContent = live ? "● Live" : "● Pending approval";
      badge.className = "profile-status-badge " + (live ? "is-live" : "is-pending");
    }
    // Force the Student type for an existing student profile.
    const ts = $("typeStudent"); if (ts) ts.checked = true;
  } else {
    // Create mode — clean slate (keep Google name prefill via updateAuthUI).
    if (titleEl) titleEl.textContent = "Create your profile";
    if (subEl) subEl.textContent = "Fill in your details — your card goes live once an admin approves it ✅";
    if (btnLabel) btnLabel.textContent = "⚡ Create profile";
    if (badge) badge.style.display = "none";
  }

  renderMyProjects();
}

/** List the graduation projects the signed-in user is a member of, on their profile. */
function renderMyProjects() {
  const wrap = $("myProjectsWrap");
  const list = $("myProjectsList");
  if (!wrap || !list) return;
  const me = (myProfile && myProfile.name) || (currentUser && currentUser.displayName) || "";
  const norm = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
  const mine = norm(me);
  const projects = Array.isArray(window.GRADUATION_PROJECTS) ? window.GRADUATION_PROJECTS : [];
  const found = !mine ? [] : projects.filter((p) => {
    const team = Array.isArray(p.team) ? p.team : Object.values(p.team || {});
    return team.some((m) => norm(m.name) === mine);
  });
  if (!found.length) { wrap.style.display = "none"; return; }
  wrap.style.display = "";
  list.innerHTML = found.map((p) => {
    const team = Array.isArray(p.team) ? p.team : Object.values(p.team || {});
    const mates = team.map((m) => esc(m.name) + (m.leader ? " ★" : "")).join(", ");
    return `<div class="my-project-item">
      <div class="my-project-head">${esc(p.icon || "🚀")} <strong>${esc(p.category || "Project")}</strong>
        <span class="my-project-meta">${esc(p.classYear || "")}</span></div>
      <div class="my-project-team">${mates}</div>
    </div>`;
  }).join("");
}

/** Render the read-only profile view card (photo → name → meta → tracks → skills → links). */
function renderProfileView() {
  const p = myProfile;
  if (!p) return;
  const initials = (p.name || "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const av = $("pvAvatar");
  if (av) {
    if (p.photo) {
      const url = String(p.photo).startsWith("http") ? p.photo : `${R2_BASE}/${p.photo}`;
      av.style.backgroundImage = `url("${url}")`;
      av.style.background = `center/cover no-repeat url("${url}")`;
      av.textContent = "";
    } else {
      av.style.background = p.color || "var(--gradient-2)";
      av.textContent = initials;
    }
  }
  setText("pvName", p.name || "");
  const metaBits = [p.department, p.university, p.classYear ? `Class of ${p.classYear}` : ""].filter(Boolean);
  setText("pvMeta", metaBits.join(" · "));

  // Status pill in the name row
  const nameEl = $("pvName");
  if (nameEl && !nameEl.querySelector(".pv-status")) {
    const pill = document.createElement("span");
    pill.className = "pv-status";
    nameEl.appendChild(pill);
  }
  const pill = nameEl && nameEl.querySelector(".pv-status");
  if (pill) {
    const live = p.status === "live";
    pill.textContent = live ? "● Live" : "● Pending";
    pill.className = "pv-status " + (live ? "is-live" : "is-pending");
  }

  const chips = (arr, cls = "chip") => (arr || []).map((x) => `<span class="${cls}">${esc(x)}</span>`).join("");
  const tracks = p.tracks || p.track || [];
  const skills = p.skills || [];
  fillBlock("pvTracksWrap", "pvTracks", chips(tracks));
  fillBlock("pvSkillsWrap", "pvSkills", chips(skills, "chip chip-skill"));

  // Social links
  const soc = p.social || {};
  const order = [["linkedin", "LinkedIn"], ["github", "GitHub"], ["whatsapp", "WhatsApp"], ["facebook", "Facebook"]];
  const links = order
    .filter(([k]) => soc[k])
    .map(([k, label]) => `<span class="pv-link">${label}</span>`)
    .join("");
  fillBlock("pvSocialWrap", "pvSocial", links);
}
function setText(id, t) { const el = $(id); if (el) el.textContent = t; }
function fillBlock(wrapId, innerId, html) {
  const wrap = $(wrapId), inner = $(innerId);
  if (inner) inner.innerHTML = html;
  if (wrap) wrap.style.display = html ? "" : "none";
}

/** Load the saved tracks into the multi-select (handled inside the form module). */
function prefillTracks(tracks) {
  if (typeof window._setSelectedTracks === "function") window._setSelectedTracks(tracks);
}

/** Show the user's already-uploaded R2 photo in the drop-zone preview. */
function showExistingPhoto(photoName) {
  const preview = $("photoPreview");
  const idle = $("dropIdle");
  const prev = $("dropPreview");
  const fileName = $("photoFileName");
  if (!preview || !idle || !prev) return;
  const url = photoName.startsWith("http") ? photoName : `${R2_BASE}/${photoName}`;
  preview.src = url;
  if (fileName) fileName.textContent = photoName;
  idle.classList.add("hidden");
  prev.classList.remove("hidden");
}

/** Reflect auth state everywhere: header menu, admin items, gates. */
function updateAuthUI() {
  const loginBtn = $("loginBtn");
  const userMenu = $("userMenu");
  const adminItem = $("menuAdminBtn");

  if (currentUser) {
    if (loginBtn) loginBtn.style.display = "none";
    if (userMenu) {
      userMenu.style.display = "flex";
      const av = $("userAvatar");
      const nm = $("userName");
      if (av) {
        if (currentUser.photoURL) {
          av.src = currentUser.photoURL;
          av.style.display = "";
        } else {
          av.style.display = "none";
        }
      }
      if (nm) nm.textContent = currentUser.displayName || currentUser.email || "Account";
    }
  } else {
    if (loginBtn) loginBtn.style.display = "";
    if (userMenu) userMenu.style.display = "none";
    closeUserMenu();
    // If a signed-out user was sitting on a portal page, send them home.
    if (typeof window.switchMode === "function" &&
        (document.body.dataset.mode === "submit" || document.body.dataset.mode === "admin")) {
      window.switchMode("home");
    }
  }

  // Admin-only menu item
  if (adminItem) adminItem.style.display = isAdmin ? "" : "none";

  // Dropdown profile item: "Create profile" (no profile yet) → "My profile".
  const menuSubmitLabel = document.querySelector("#menuSubmitBtn span");
  if (menuSubmitLabel) menuSubmitLabel.textContent = myProfile ? "My profile" : "Create profile";

  // Home CTA mirrors the same wording.
  const homeCta = $("homeProfileCta");
  if (homeCta) homeCta.textContent = currentUser
    ? (myProfile ? "My profile" : "Create your profile")
    : "Create your profile";

  // Submit section: gate vs form
  const submitGate = $("submitLoginGate");
  const submitForm = $("submitFormWrap");
  if (submitGate && submitForm) {
    submitGate.style.display = currentUser ? "none" : "block";
    submitForm.style.display = currentUser ? "block" : "none";
    const who = $("submitAsWho");
    if (who && currentUser) {
      who.textContent = currentUser.displayName || currentUser.email || "";
    }
    // Prefill name from the Google profile (only if empty).
    const nameEl = $("inputName");
    if (nameEl && currentUser && !nameEl.value) {
      nameEl.value = currentUser.displayName || "";
    }
  }

  // Admin section: gate vs panel
  const adminGate = $("adminLoginGate");
  const adminPanel = $("adminPanel");
  if (adminGate && adminPanel) {
    adminGate.style.display = isAdmin ? "none" : "block";
    adminPanel.style.display = isAdmin ? "block" : "none";
    const msg = $("adminGateMsg");
    if (msg) {
      msg.textContent = currentUser
        ? "This account is not the administrator. Approvals are restricted."
        : "Sign in with the administrator account to review submissions.";
    }
  }
}

/* ════════════════════════════════════════════
  § 3 — SUBMISSION FORM
  (ported from the standalone Submit_form portal)
════════════════════════════════════════════ */
let formState = {
  submissionType: "student",
  photoFile: null,
  photoPath: "",
  selectedColor: "linear-gradient(135deg, #ef4444, #b91c1c)",
  isUploading: false,
};

function initSubmissionForm() {
  const form = $("submissionForm");
  if (!form) return;

  const typeStudent = $("typeStudent");
  const typeProject = $("typeProject");
  const studentContainer = $("studentFormContainer");
  const projectContainer = $("projectFormContainer");
  const inputCategory = $("inputCategory");
  const inputCategoryOther = $("inputCategoryOther");
  const teamMembersList = $("teamMembersList");
  const btnAddMember = $("btnAddMember");
  const inputTrackOther = $("inputTrackOther");
  const trackChips = $("trackChips");
  const validationErrors = $("validationErrors");
  const dropZone = $("dropZone");
  const photoInput = $("photoInput");
  const dropIdle = $("dropIdle");
  const dropPreview = $("dropPreview");
  const photoPreview = $("photoPreview");
  const photoFileName = $("photoFileName");
  const photoPathDisplay = $("photoPathDisplay");
  const btnRemovePhoto = $("btnRemovePhoto");
  const btnGenerate = $("btnGenerate");
  const uploadProgress = $("uploadProgress");
  const progressBar = $("progressBar");
  const stepPhotoStatus = $("stepPhotoStatus");
  const stepCodeStatus = $("stepCodeStatus");
  const firebaseSuccess = $("firebaseSuccess");

  /* — Type toggle (student / project) — */
  [typeStudent, typeProject].forEach((radio) => {
    radio.addEventListener("change", (e) => {
      formState.submissionType = e.target.value;
      const isStudent = formState.submissionType === "student";
      studentContainer.classList.toggle("active", isStudent);
      studentContainer.classList.toggle("hidden", !isStudent);
      projectContainer.classList.toggle("active", !isStudent);
      projectContainer.classList.toggle("hidden", isStudent);
      validationErrors.classList.add("hidden");
    });
  });

  /* — Category "other" — */
  inputCategory.addEventListener("change", () => {
    if (inputCategory.value === "other") {
      inputCategoryOther.classList.remove("hidden");
      inputCategoryOther.focus();
    } else {
      inputCategoryOther.classList.add("hidden");
    }
  });

  /* — Dynamic team list — */
  // Shared <datalist> of registered yearbook students for team-member
  // autocomplete (so projects link to real, registered people).
  function ensureStudentsDatalist() {
    let dl = $("registeredStudentsList");
    if (!dl) {
      dl = document.createElement("datalist");
      dl.id = "registeredStudentsList";
      document.body.appendChild(dl);
    }
    const names = Array.isArray(window.STUDENTS)
      ? [...new Set(window.STUDENTS.map((s) => s.name).filter(Boolean))].sort((a, b) => a.localeCompare(b))
      : [];
    dl.innerHTML = names.map((n) => `<option value="${n.replace(/"/g, "&quot;")}"></option>`).join("");
  }

  function createTeamRow(isLeader = false) {
    ensureStudentsDatalist();
    const row = document.createElement("div");
    row.className = "team-member-row";
    const uid = Math.random().toString(36).substr(2, 9);
    row.innerHTML = `
        <input type="text" class="member-name" list="registeredStudentsList" placeholder="Start typing a registered name…" autocomplete="off" />
        <label class="leader-label" for="leader_${uid}">
            <input type="radio" name="teamLeader" id="leader_${uid}" value="1" ${isLeader ? "checked" : ""} />
            Leader
        </label>
        <button type="button" class="btn-remove btn-remove-member" title="Remove member">✕</button>`;
    row.querySelector(".btn-remove-member").addEventListener("click", () => {
      if (teamMembersList.children.length > 1) row.remove();
      else showValidation(["A team must have at least one member."]);
    });
    return row;
  }
  teamMembersList.innerHTML = "";
  teamMembersList.appendChild(createTeamRow(true));
  btnAddMember.addEventListener("click", () =>
    teamMembersList.appendChild(createTeamRow(false)),
  );

  /* — Photo drag / drop / preview — */
  function applyPhoto(file) {
    if (!file || !file.type.startsWith("image/")) return;
    if (file.size > 5 * 1024 * 1024) {
      showValidation(["Photo must be under 5 MB."]);
      return;
    }
    formState.photoFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
      photoPreview.src = e.target.result;
      photoFileName.textContent = file.name;
      photoPathDisplay.textContent = "📂 Path will be generated using your first name";
      dropIdle.classList.add("hidden");
      dropPreview.classList.remove("hidden");
    };
    reader.readAsDataURL(file);
  }
  function removePhoto() {
    formState.photoFile = null;
    formState.photoPath = "";
    photoInput.value = "";
    photoPreview.src = "";
    photoPathDisplay.textContent = "Generated path will appear here after upload";
    dropIdle.classList.remove("hidden");
    dropPreview.classList.add("hidden");
  }
  dropZone.addEventListener("click", () => photoInput.click());
  dropZone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") photoInput.click();
  });
  photoInput.addEventListener("change", () => {
    if (photoInput.files.length) applyPhoto(photoInput.files[0]);
  });
  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("drag-over");
  });
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("drag-over");
    if (e.dataTransfer.files[0]) applyPhoto(e.dataTransfer.files[0]);
  });
  btnRemovePhoto.addEventListener("click", (e) => {
    e.stopPropagation();
    removePhoto();
  });

  /* — Track multi-select (dropdown + chips + custom tracks) — */
  // Built-in tracks always offered. Custom tracks discovered from existing
  // students get merged in (collectKnownTracks) so a track someone added via
  // "Other" becomes selectable for everyone else.
  const BUILTIN_TRACKS = [
    "Embedded Systems", "Embedded Linux", "Digital Design",
    "Digital Design & Verification", "Network Engineer", "DevOps",
    "AI", "Software Testing",
  ];
  const selectedTracks = new Set();
  const trackSelectBtn = $("trackSelectBtn");
  const trackMenu = $("trackMenu");
  const trackOtherAdd = $("trackOtherAdd");

  function getSelectedTracks() {
    return Array.from(selectedTracks);
  }

  // Merge built-ins with any tracks already used by live students on the site.
  function collectKnownTracks() {
    const set = new Set(BUILTIN_TRACKS);
    if (Array.isArray(window.STUDENTS)) {
      window.STUDENTS.forEach((s) => {
        const t = Array.isArray(s.track) ? s.track : [s.track];
        t.forEach((x) => { if (x) set.add(x); });
      });
    }
    // Always include whatever's currently selected (e.g. a just-added custom one).
    selectedTracks.forEach((x) => set.add(x));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }

  function renderTrackMenu() {
    if (!trackMenu) return;
    const otherRow = trackMenu.querySelector(".track-menu-other");
    // Clear existing option rows (keep the "other" input row).
    trackMenu.querySelectorAll(".track-option").forEach((el) => el.remove());
    const frag = document.createDocumentFragment();
    collectKnownTracks().forEach((t) => {
      const row = document.createElement("label");
      row.className = "track-option";
      const checked = selectedTracks.has(t) ? "checked" : "";
      row.innerHTML = `<input type="checkbox" value="${t.replace(/"/g, "&quot;")}" ${checked}> <span>${t}</span>`;
      row.querySelector("input").addEventListener("change", (e) => {
        if (e.target.checked) selectedTracks.add(t); else selectedTracks.delete(t);
        renderTrackChips();
        updateTrackBtnLabel();
      });
      frag.appendChild(row);
    });
    trackMenu.insertBefore(frag, otherRow);
  }

  function updateTrackBtnLabel() {
    if (!trackSelectBtn) return;
    const ph = trackSelectBtn.querySelector(".track-select-placeholder");
    if (!ph) return;
    const n = selectedTracks.size;
    ph.textContent = n === 0 ? "Select your track(s)…" : `${n} track${n > 1 ? "s" : ""} selected`;
    ph.classList.toggle("has-value", n > 0);
  }

  function renderTrackChips() {
    if (!trackChips) return;
    trackChips.innerHTML = "";
    getSelectedTracks().forEach((t) => {
      const c = document.createElement("span");
      c.className = "chip chip-removable";
      c.innerHTML = `<span>${t}</span><button type="button" class="chip-x" aria-label="Remove ${t}">✕</button>`;
      c.querySelector(".chip-x").addEventListener("click", () => {
        selectedTracks.delete(t);
        renderTrackChips();
        renderTrackMenu();
        updateTrackBtnLabel();
      });
      trackChips.appendChild(c);
    });
  }

  // Dropdown open/close
  if (trackSelectBtn && trackMenu) {
    trackSelectBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = trackMenu.classList.toggle("open");
      trackSelectBtn.setAttribute("aria-expanded", open ? "true" : "false");
      if (open) renderTrackMenu();
    });
    document.addEventListener("click", (e) => {
      if (!e.target.closest("#trackSelect")) {
        trackMenu.classList.remove("open");
        trackSelectBtn.setAttribute("aria-expanded", "false");
      }
    });
  }

  // Add a custom track from the "Other" input.
  function addCustomTrack() {
    const val = (inputTrackOther.value || "").trim();
    if (!val) return;
    val.split(",").map((s) => s.trim()).filter(Boolean).forEach((t) => selectedTracks.add(t));
    inputTrackOther.value = "";
    renderTrackMenu();
    renderTrackChips();
    updateTrackBtnLabel();
  }
  if (trackOtherAdd) trackOtherAdd.addEventListener("click", addCustomTrack);
  if (inputTrackOther) {
    inputTrackOther.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); addCustomTrack(); }
    });
  }

  // Expose so hydrateProfileForm()/prefillTracks() (outside this closure) can
  // set the selection programmatically when editing an existing profile.
  window._setSelectedTracks = (tracks) => {
    selectedTracks.clear();
    (Array.isArray(tracks) ? tracks : [tracks]).forEach((t) => { if (t) selectedTracks.add(t); });
    renderTrackMenu();
    renderTrackChips();
    updateTrackBtnLabel();
  };
  window._renderTrackChips = renderTrackChips;

  /* — Skills multi-select (grouped by category, searchable, custom add) — */
  const selectedSkills = new Set();
  const customSkills = new Set();   // session-added customs to keep them listed
  const skillSelectBtn = $("skillSelectBtn");
  const skillMenu = $("skillMenu");
  const skillSearch = $("skillSearch");
  const skillChips = $("skillChips");
  const inputSkillOther = $("inputSkillOther");
  const skillOtherAdd = $("skillOtherAdd");

  function getSelectedSkills() { return Array.from(selectedSkills); }

  // Merge built-in categories with any custom skills seen on the site + session.
  function skillCategories() {
    const cats = {};
    Object.entries(SKILL_CATEGORIES).forEach(([k, v]) => { cats[k] = [...v]; });
    const extras = new Set(customSkills);
    if (Array.isArray(window.STUDENTS)) {
      window.STUDENTS.forEach((s) => (s.skills || []).forEach((x) => { if (x) extras.add(x); }));
    }
    selectedSkills.forEach((x) => extras.add(x));
    // Anything not already in a built-in category goes under "Other".
    const builtins = new Set(Object.values(SKILL_CATEGORIES).flat().map((x) => x.toLowerCase()));
    const otherList = [...extras].filter((x) => !builtins.has(x.toLowerCase()));
    if (otherList.length) cats["Other"] = otherList.sort((a, b) => a.localeCompare(b));
    return cats;
  }

  function renderSkillMenu(filter = "") {
    if (!skillMenu) return;
    const search = skillMenu.querySelector(".track-menu-search");
    const otherRow = skillMenu.querySelector(".track-menu-other");
    skillMenu.querySelectorAll(".track-group").forEach((el) => el.remove());
    const q = filter.trim().toLowerCase();
    const frag = document.createDocumentFragment();
    Object.entries(skillCategories()).forEach(([cat, list]) => {
      const matches = list.filter((s) => !q || s.toLowerCase().includes(q));
      if (!matches.length) return;
      const group = document.createElement("div");
      group.className = "track-group";
      group.innerHTML = `<div class="track-group-title">${cat}</div>`;
      matches.forEach((s) => {
        const row = document.createElement("label");
        row.className = "track-option";
        row.innerHTML = `<input type="checkbox" value="${s.replace(/"/g, "&quot;")}" ${selectedSkills.has(s) ? "checked" : ""}> <span>${s}</span>`;
        row.querySelector("input").addEventListener("change", (e) => {
          if (e.target.checked) selectedSkills.add(s); else selectedSkills.delete(s);
          renderSkillChips(); updateSkillBtnLabel();
        });
        group.appendChild(row);
      });
      frag.appendChild(group);
    });
    // Insert groups between the search row and the "other" row.
    skillMenu.insertBefore(frag, otherRow);
    if (search && !skillMenu.contains(search)) skillMenu.insertBefore(search, skillMenu.firstChild);
  }

  function updateSkillBtnLabel() {
    if (!skillSelectBtn) return;
    const ph = skillSelectBtn.querySelector(".track-select-placeholder");
    if (!ph) return;
    const n = selectedSkills.size;
    ph.textContent = n === 0 ? "Add your skills…" : `${n} skill${n > 1 ? "s" : ""} selected`;
    ph.classList.toggle("has-value", n > 0);
  }

  function renderSkillChips() {
    if (!skillChips) return;
    skillChips.innerHTML = "";
    getSelectedSkills().forEach((s) => {
      const c = document.createElement("span");
      c.className = "chip chip-removable chip-skill";
      c.innerHTML = `<span>${s}</span><button type="button" class="chip-x" aria-label="Remove ${s}">✕</button>`;
      c.querySelector(".chip-x").addEventListener("click", () => {
        selectedSkills.delete(s); renderSkillChips(); renderSkillMenu(skillSearch ? skillSearch.value : ""); updateSkillBtnLabel();
      });
      skillChips.appendChild(c);
    });
  }

  if (skillSelectBtn && skillMenu) {
    skillSelectBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = skillMenu.classList.toggle("open");
      skillSelectBtn.setAttribute("aria-expanded", open ? "true" : "false");
      if (open) { renderSkillMenu(); if (skillSearch) { skillSearch.value = ""; skillSearch.focus(); } }
    });
    document.addEventListener("click", (e) => {
      if (!e.target.closest("#skillSelect")) {
        skillMenu.classList.remove("open");
        skillSelectBtn.setAttribute("aria-expanded", "false");
      }
    });
  }
  if (skillSearch) skillSearch.addEventListener("input", () => renderSkillMenu(skillSearch.value));

  function addCustomSkill() {
    const val = (inputSkillOther.value || "").trim();
    if (!val) return;
    val.split(",").map((s) => s.trim()).filter(Boolean).forEach((s) => { customSkills.add(s); selectedSkills.add(s); });
    inputSkillOther.value = "";
    renderSkillMenu(); renderSkillChips(); updateSkillBtnLabel();
  }
  if (skillOtherAdd) skillOtherAdd.addEventListener("click", addCustomSkill);
  if (inputSkillOther) inputSkillOther.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); addCustomSkill(); }
  });

  window._getSelectedSkills = getSelectedSkills;
  window._setSelectedSkills = (skills) => {
    selectedSkills.clear();
    (Array.isArray(skills) ? skills : [skills]).forEach((s) => { if (s) selectedSkills.add(s); });
    renderSkillChips(); updateSkillBtnLabel();
  };

  /* — Validation — */
  function isValidUrl(str) {
    if (!str) return true;
    try {
      const u = new URL(str.startsWith("http") ? str : `https://${str}`);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  }
  function validate() {
    const errors = [];
    const inputName = $("inputName");
    const inputGender = $("inputGender");
    const inputIcon = $("inputIcon");
    const req = (el, msg) => {
      if (!el.value.trim()) {
        errors.push(msg);
        el.classList.add("invalid");
      } else el.classList.remove("invalid");
    };

    if (formState.submissionType === "student") {
      req(inputName, "Full Name is required.");
      req(inputGender, "Please select a gender.");
      if (!readSelectWithOther("inputUniversity")) errors.push("Please choose your University.");
      if (!readSelectWithOther("inputFaculty")) errors.push("Please choose your Faculty.");
      if (!readSelectWithOther("inputDepartment")) errors.push("Please choose your Department.");
      if (getSelectedTracks().length === 0) errors.push("At least one Track is required.");
      [
        { el: $("inputLinkedin"), l: "LinkedIn" },
        { el: $("inputGithub"), l: "GitHub" },
        { el: $("inputFacebook"), l: "Facebook" },
      ].forEach(({ el, l }) => {
        if (el.value.trim() && !isValidUrl(el.value.trim())) {
          errors.push(`${l} URL doesn't look valid.`);
          el.classList.add("invalid");
        } else el.classList.remove("invalid");
      });
    } else {
      if (!inputCategory.value) {
        errors.push("Please select a Project Category.");
        inputCategory.classList.add("invalid");
      } else {
        inputCategory.classList.remove("invalid");
        if (inputCategory.value === "other") req(inputCategoryOther, "Please specify the custom category.");
      }
      req(inputIcon, "Project Icon is required.");
      if (!readSelectWithOther("pjUniversity")) errors.push("Please choose the University.");
      if (!readSelectWithOther("pjFaculty")) errors.push("Please choose the Faculty.");
      if (!readSelectWithOther("pjDepartment")) errors.push("Please choose the Department.");
      let hasLeader = false;
      let emptyName = false;
      const rows = teamMembersList.querySelectorAll(".team-member-row");
      rows.forEach((row) => {
        const input = row.querySelector(".member-name");
        const radio = row.querySelector('input[type="radio"]');
        if (!input.value.trim()) {
          input.classList.add("invalid");
          emptyName = true;
        } else input.classList.remove("invalid");
        if (radio.checked) hasLeader = true;
      });
      if (emptyName) errors.push("All team member names must be filled.");
      if (!hasLeader) errors.push("Please select exactly one Team Leader.");
      if (rows.length === 0) errors.push("Please add at least one team member.");
    }
    return errors;
  }
  function showValidation(errors) {
    if (!errors.length) {
      validationErrors.classList.add("hidden");
      return;
    }
    validationErrors.innerHTML = `<ul>${errors.map((e) => `<li>${e}</li>`).join("")}</ul>`;
    validationErrors.classList.remove("hidden");
  }

  /* — Progress helpers — */
  const setProgress = (pct) => (progressBar.style.width = `${Math.min(pct, 100)}%`);
  function markStep(stepEl, statusEl, ok) {
    stepEl.classList.add(ok ? "step-done" : "step-error");
    statusEl.textContent = ok ? "✓" : "✕";
  }

  /* — Upload photo to R2 via serverless — */
  async function uploadPhoto(file, filename) {
    setProgress(20);
    const fileBase64 = await fileToBase64(file);
    setProgress(35);
    const res = await fetch("/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileBase64, filename, mimeType: file.type || "image/webp" }),
    });
    let json;
    try {
      json = await res.json();
    } catch {
      throw new Error(`Upload server error (${res.status}). Check R2 env vars on Vercel.`);
    }
    if (!res.ok || !json.success) throw new Error(json?.error || `Upload error ${res.status}`);
    setProgress(65);
    return json;
  }

  /* — Write the submission to /pending — */
  async function submitToPending(data) {
    if (!currentUser) throw new Error("You must sign in first.");
    const entry = {
      type: data.type,
      status: "pending",
      submittedByUid: currentUser.uid,
      submittedByEmail: currentUser.email || "",
      submittedByName: currentUser.displayName || "",
      createdAt: Date.now(),
      payload: data,
    };
    const pendingRef = push(ref(db, "pending"));
    await set(pendingRef, entry);
    notifyAdmin({ type: "submission", name: currentUser.displayName || "", kind: `${data.type} submission` });
  }

  /* — Shape the form data into a /profiles/{uid} object — */
  function buildProfileObject(data) {
    return {
      uid: currentUser.uid,
      email: currentUser.email || "",
      name: data.name,
      gender: data.gender,
      photo: data.photo || "",
      tracks: data.tracks || [],
      skills: data.skills || [],
      color: data.color || formState.selectedColor,
      university: data.university,
      faculty: data.faculty,
      department: data.department,
      classYear: data.classYear,
      social: {
        linkedin: data.linkedin || "",
        github: data.github || "",
        whatsapp: data.whatsapp || "",
        facebook: data.facebook || "",
      },
    };
  }

  /*
   * Save the student's profile to /profiles/{uid}.
   *  • New profile (or still pending) → status "pending" + a /pending entry
   *    so the admin can approve it the first time.
   *  • Already-approved profile (status "live") → write straight to /profiles
   *    (and let the merge in fetchFirebaseData surface it). No re-approval.
   * Returns true if the save is live, false if it went to the approval queue.
   */
  async function saveStudentProfile(data) {
    if (!currentUser) throw new Error("You must sign in first.");

    // Admin adding someone else directly → write a live, name-keyed /students
    // record (no profile, no approval). Returns live=true.
    if (adminAddMode && isAdmin) {
      const rec = buildLiveRecord({ ...data, type: "student" });
      await set(ref(db, `${rec.node}/${rec.key}`), rec.payload);
      return true;
    }

    const uid = currentUser.uid;
    const wasLive = myProfile && myProfile.status === "live";
    const base = buildProfileObject(data);
    const now = Date.now();

    if (wasLive) {
      await set(ref(db, `profiles/${uid}`), {
        ...base,
        status: "live",
        createdAt: myProfile.createdAt || now,
        updatedAt: now,
      });
      return true;
    }

    // New or pending: store the profile as pending + queue it for approval.
    await set(ref(db, `profiles/${uid}`), {
      ...base,
      status: "pending",
      createdAt: (myProfile && myProfile.createdAt) || now,
      updatedAt: now,
    });
    // Upsert a single pending entry keyed by uid so repeated edits don't pile up.
    await set(ref(db, `pending/profile_${uid}`), {
      type: "student",
      status: "pending",
      submittedByUid: uid,
      submittedByEmail: currentUser.email || "",
      submittedByName: currentUser.displayName || "",
      createdAt: now,
      payload: { ...data, ownerUid: uid },
    });
    // Tell the admin a new profile is waiting (best-effort email).
    notifyAdmin({ type: "submission", name: data.name, kind: "student profile" });
    return false;
  }

  // Expose for hydrateProfileForm() (defined outside this closure).
  window._buildProfileObject = buildProfileObject;

  /* — Main submit handler — */
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (formState.isUploading) return;
    if (!currentUser) {
      showValidation(["Please sign in with Google first."]);
      return;
    }

    const errors = validate();
    showValidation(errors);
    if (errors.length) {
      validationErrors.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    // Collect data
    let data;
    if (formState.submissionType === "student") {
      const inputName = $("inputName");
      // Keep the existing photo if the user didn't pick a new one (edit mode).
      if (formState.photoFile) {
        const firstName = inputName.value.trim().split(/\s+/)[0];
        formState.photoPath = sanitiseFileName(`${firstName}.webp`);
      } else if (myProfile && myProfile.photo) {
        formState.photoPath = myProfile.photo;
      }
      data = {
        type: "student",
        name: inputName.value.trim(),
        gender: $("inputGender").value,
        photo: formState.photoPath,
        tracks: getSelectedTracks(),
        skills: getSelectedSkills(),
        color: formState.selectedColor,
        university: readSelectWithOther("inputUniversity"),
        faculty: readSelectWithOther("inputFaculty"),
        department: readSelectWithOther("inputDepartment"),
        classYear: $("inputClassYear").value,
        linkedin: $("inputLinkedin").value.trim(),
        github: $("inputGithub").value.trim(),
        whatsapp: $("inputWhatsapp").value.trim(),
        facebook: $("inputFacebook").value.trim(),
      };
    } else {
      const team = [];
      teamMembersList.querySelectorAll(".team-member-row").forEach((row) => {
        team.push({
          name: row.querySelector(".member-name").value.trim(),
          leader: row.querySelector('input[type="radio"]').checked,
        });
      });
      const finalCategory =
        inputCategory.value === "other" ? inputCategoryOther.value.trim() : inputCategory.value;
      data = {
        type: "project",
        category: finalCategory,
        icon: $("inputIcon").value.trim(),
        team,
        university: readSelectWithOther("pjUniversity"),
        faculty: readSelectWithOther("pjFaculty"),
        department: readSelectWithOther("pjDepartment"),
        classYear: $("pjClassYear").value,
      };
    }

    // Start
    firebaseSuccess.classList.add("hidden");
    formState.isUploading = true;
    btnGenerate.disabled = true;
    uploadProgress.classList.remove("hidden");
    setProgress(5);
    ["step-photo", "step-code"].forEach((id) => {
      const el = $(id);
      if (el) el.classList.remove("step-done", "step-error");
    });
    stepPhotoStatus.textContent = "";
    stepCodeStatus.textContent = "";

    const stepPhotoEl = $("step-photo");
    if (formState.submissionType === "student") {
      if (stepPhotoEl) stepPhotoEl.style.display = "flex";
    } else if (stepPhotoEl) {
      stepPhotoEl.style.display = "none";
    }
    btnGenerate.querySelector(".btn-label").textContent = "⏳ Working…";

    try {
      // A — Upload image (students only)
      if (formState.submissionType === "student" && formState.photoFile) {
        btnGenerate.querySelector(".btn-label").textContent = "⏳ Compressing…";
        const compressed = await compressImage(formState.photoFile);
        btnGenerate.querySelector(".btn-label").textContent = "⏳ Uploading…";
        await uploadPhoto(compressed, formState.photoPath);
      }
      markStep($("step-photo"), stepPhotoStatus, true);

      // B — Save. Students = profile (create→pending / edit→live-direct);
      //         Projects = pending queue (admin approves).
      btnGenerate.querySelector(".btn-label").textContent = "⏳ Saving…";
      let savedLive = false;
      if (data.type === "student") {
        savedLive = await saveStudentProfile(data);
      } else {
        await submitToPending(data);
      }
      markStep($("step-code"), stepCodeStatus, true);
      setProgress(100);

      // Success copy depends on whether it went live or to the queue.
      const fsTitle = firebaseSuccess.querySelector(".fs-title");
      if (fsTitle) {
        fsTitle.textContent = adminAddMode
          ? "Student added — now live on the site."
          : savedLive
            ? "Saved! Your changes are now live on the site."
            : "Submitted! It will appear once an admin approves it.";
      }
      firebaseSuccess.classList.remove("hidden");

      if (adminAddMode) {
        // Admin added someone else: clear the form for the next add.
        form.reset();
        removePhoto();
        renderTrackChips();
        if (typeof window._setSelectedTracks === "function") window._setSelectedTracks([]);
        if (typeof window.fetchFirebaseData === "function") window.fetchFirebaseData();
      } else if (data.type === "project") {
        // Projects: clear the form for another submission.
        form.reset();
        removePhoto();
        renderTrackChips();
        if ($("inputName") && currentUser) $("inputName").value = currentUser.displayName || "";
      } else {
        // Students: profile saved — drop back to the read-only view card.
        myProfile = { ...(myProfile || {}), ...buildProfileObject(data), status: savedLive ? "live" : "pending" };
        editMode = false;
        hydrateProfileForm();
        // Refresh the live site so an edit shows immediately.
        if (savedLive && typeof window.fetchFirebaseData === "function") window.fetchFirebaseData();
      }
      setTimeout(() => uploadProgress.classList.add("hidden"), 1600);
    } catch (err) {
      console.error("Submit error:", err);
      showValidation([`❌ Save failed: ${err.message}`]);
      validationErrors.scrollIntoView({ behavior: "smooth", block: "center" });
      markStep($("step-photo"), stepPhotoStatus, false);
    } finally {
      formState.isUploading = false;
      btnGenerate.disabled = false;
    }
  });

  // Live cleanup of invalid styling
  ["inputName", "inputLinkedin", "inputGithub", "inputWhatsapp", "inputFacebook"].forEach((id) => {
    const el = $(id);
    if (el) el.addEventListener("input", () => el.classList.remove("invalid"));
  });

  // Populate the institution selects up-front so they're ready before sign-in.
  populateInstitutionSelects(null);
  renderTrackMenu();
}

/* — Image compression (Canvas → WebP) — */
async function compressImage(file, maxWidth = 800, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let { width, height } = img;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (!blob) return reject(new Error("Canvas is empty"));
            const name = file.name.replace(/\.[^/.]+$/, ".webp");
            resolve(new File([blob], name, { type: "image/webp", lastModified: Date.now() }));
          },
          "image/webp",
          quality,
        );
      };
      img.onerror = reject;
    };
    reader.onerror = reject;
  });
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ════════════════════════════════════════════
   § 4 — ADMIN APPROVALS
════════════════════════════════════════════ */
/** Build the live record (key + node + payload) from a submission's data. */
function buildLiveRecord(data) {
  if (data.type === "student") {
    // Key by ownerUid when available so two students with the same name don't
    // collide; fall back to the sanitized name for legacy/admin-added records.
    return {
      node: "students",
      key: data.ownerUid || sanitizeKey(data.name),
      payload: {
        name: data.name,
        photo: data.photo || "",
        track: data.tracks || [],
        skills: data.skills || [],
        color: data.color,
        gender: data.gender,
        university: data.university || "",
        faculty: data.faculty || "",
        department: data.department || "",
        classYear: data.classYear || "",
        ownerUid: data.ownerUid || "",
        social: {
          linkedin: data.linkedin || "",
          github: data.github || "",
          whatsapp: data.whatsapp || "",
          facebook: data.facebook || "",
        },
      },
    };
  }
  const catKey = sanitizeKey(data.category);
  const teamArr = Array.isArray(data.team) ? [...data.team] : [];
  const leaderEntry = teamArr.find((m) => m.leader);
  const leaderKey = leaderEntry ? sanitizeKey(leaderEntry.name) : "Unknown";
  teamArr.sort((a, b) => {
    if (a.leader && !b.leader) return -1;
    if (!a.leader && b.leader) return 1;
    return a.name.localeCompare(b.name);
  });
  const teamObj = {};
  teamArr.forEach((m, i) => {
    const prefix = m.leader ? "0000" : String(i).padStart(4, "0");
    teamObj[`${prefix}_${sanitizeKey(m.name)}`] = { name: m.name, leader: m.leader || false };
  });
  return {
    node: "projects",
    key: `${catKey}_${leaderKey}`,
    payload: {
      category: data.category,
      icon: data.icon,
      team: teamObj,
      university: data.university || "",
      faculty: data.faculty || "",
      department: data.department || "",
      classYear: data.classYear || "",
    },
  };
}

async function loadPending() {
  if (!isAdmin) return;
  const list = $("pendingList");
  const empty = $("pendingEmpty");
  if (!list) return;
  list.innerHTML = '<p class="pending-loading">Loading…</p>';
  try {
    const snap = await get(ref(db, "pending"));
    pendingCache = snap.val() || {};
    renderPending();
  } catch (err) {
    console.error("Load pending failed:", err);
    list.innerHTML = `<p class="pending-loading">Failed to load: ${err.message}</p>`;
    if (empty) empty.style.display = "none";
  }
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]),
  );
}

function renderPending() {
  const list = $("pendingList");
  const empty = $("pendingEmpty");
  const count = $("pendingCount");
  if (!list) return;

  const ids = Object.keys(pendingCache);
  if (count) count.textContent = String(ids.length);

  // Mirror the count on the account-menu badge (only meaningful for the admin).
  const menuBadge = $("menuPendingCount");
  if (menuBadge) {
    menuBadge.textContent = String(ids.length);
    menuBadge.style.display = ids.length > 0 ? "" : "none";
  }

  if (ids.length === 0) {
    list.innerHTML = "";
    if (empty) empty.style.display = "block";
    return;
  }
  if (empty) empty.style.display = "none";

  // Newest first
  ids.sort((a, b) => (pendingCache[b]?.createdAt || 0) - (pendingCache[a]?.createdAt || 0));

  list.innerHTML = ids
    .map((id) => {
      const e = pendingCache[id];
      const d = e.payload || {};
      const submitter = `${esc(e.submittedByName || "—")} <span class="pc-email">${esc(e.submittedByEmail || "")}</span>`;
      let body = "";
      if (d.type === "student") {
        const photo = d.photo ? `${R2_BASE}/${esc(d.photo)}` : "";
        const tracks = (d.tracks || []).map((t) => `<span class="chip">${esc(t)}</span>`).join("");
        const socials = ["linkedin", "github", "whatsapp", "facebook"]
          .filter((k) => d[k])
          .map((k) => `<a href="${esc(d[k])}" target="_blank" rel="noopener">${k}</a>`)
          .join(" · ");
        body = `
          <div class="pc-student">
            ${photo ? `<img class="pc-photo" src="${photo}" alt="" onerror="this.style.display='none'">` : ""}
            <div class="pc-fields">
              <div class="pc-name">${esc(d.name)}</div>
              <div class="pc-meta">${esc(d.gender || "")}</div>
              <div class="chip-container">${tracks}</div>
              ${socials ? `<div class="pc-socials">${socials}</div>` : ""}
            </div>
          </div>`;
      } else {
        const team = (Array.isArray(d.team) ? d.team : [])
          .map((m) => `<span class="chip${m.leader ? " is-leader" : ""}">${m.leader ? "★ " : ""}${esc(m.name)}</span>`)
          .join("");
        body = `
          <div class="pc-project">
            <div class="pc-name">${esc(d.icon || "")} ${esc(d.category)}</div>
            <div class="chip-container">${team}</div>
          </div>`;
      }
      return `
        <div class="pending-card" data-id="${id}">
          <div class="pc-head">
            <span class="pc-type pc-type-${d.type}">${d.type === "student" ? "👤 Student" : "🚀 Project"}</span>
            <span class="pc-by">by ${submitter}</span>
          </div>
          ${body}
          <div class="pc-actions">
            <button class="pc-btn pc-approve" data-act="approve" data-id="${id}">✓ Approve</button>
            <button class="pc-btn pc-reject" data-act="reject" data-id="${id}">✕ Reject</button>
          </div>
        </div>`;
    })
    .join("");

  list.querySelectorAll("[data-act]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      if (btn.dataset.act === "approve") approve(id, btn);
      else reject(id, btn);
    });
  });
}

async function approve(id, btn) {
  const entry = pendingCache[id];
  if (!entry || !entry.payload) return;
  btn.disabled = true;
  btn.textContent = "…";
  try {
    const rec = buildLiveRecord(entry.payload);
    await set(ref(db, `${rec.node}/${rec.key}`), rec.payload);
    // If this came from a Google-linked student profile, flip it to "live"
    // so future self-edits show instantly without re-approval.
    const ownerUid = entry.payload.ownerUid || entry.submittedByUid;
    if (entry.payload.type === "student" && ownerUid) {
      const snap = await get(ref(db, `profiles/${ownerUid}`));
      if (snap.exists()) {
        await set(ref(db, `profiles/${ownerUid}/status`), "live");
      }
    }
    await remove(ref(db, `pending/${id}`));
    delete pendingCache[id];
    renderPending();
    // Refresh the live site data so the new record shows immediately.
    if (typeof window.fetchFirebaseData === "function") window.fetchFirebaseData();
  } catch (err) {
    console.error("Approve failed:", err);
    alert("Approve failed: " + err.message);
    btn.disabled = false;
    btn.textContent = "✓ Approve";
  }
}

async function reject(id, btn) {
  if (!confirm("Reject and permanently delete this submission?")) return;
  btn.disabled = true;
  try {
    await remove(ref(db, `pending/${id}`));
    delete pendingCache[id];
    renderPending();
  } catch (err) {
    console.error("Reject failed:", err);
    alert("Reject failed: " + err.message);
    btn.disabled = false;
  }
}

/*
 * Admin-only: permanently remove a student from the yearbook.
 * Deletes both the live /profiles/{uid} (if any) and the /students/{key}
 * mirror, then refreshes the site. Exposed on window for script.js cards.
 */
async function adminDeleteStudent(student) {
  if (!isAdmin) return;
  if (!confirm(`Permanently delete "${student.name}" from the yearbook?`)) return;
  try {
    const ops = [];
    if (student.ownerUid) {
      ops.push(remove(ref(db, `profiles/${student.ownerUid}`)));
      ops.push(remove(ref(db, `students/${student.ownerUid}`)));
    }
    // Also clear any name-keyed legacy record.
    ops.push(remove(ref(db, `students/${sanitizeKey(student.name)}`)));
    await Promise.all(ops);
    if (typeof window.fetchFirebaseData === "function") window.fetchFirebaseData();
  } catch (err) {
    console.error("Delete failed:", err);
    alert("Delete failed: " + err.message);
  }
}
window.adminDeleteStudent = adminDeleteStudent;

/* ════════════════════════════════════════════
   § 5 — WIRE UP
════════════════════════════════════════════ */
function init() {
  // Sign-in buttons (header + both page gates)
  ["loginBtn", "gateLoginBtn", "adminGateLoginBtn"].forEach((id) => {
    const el = $(id);
    if (el) el.addEventListener("click", login);
  });
  const logoutBtn = $("logoutBtn");
  if (logoutBtn) logoutBtn.addEventListener("click", () => { closeUserMenu(); logout(); });

  // Account dropdown: chip toggles it; clicking outside / Esc closes it.
  const chip = $("userChip");
  if (chip) {
    chip.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleUserMenu();
    });
  }
  document.addEventListener("click", (e) => {
    const menu = $("userMenu");
    if (menu && !menu.contains(e.target)) closeUserMenu();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeUserMenu();
  });

  // Menu items navigate to the portal pages, then close the menu.
  // (switchMode lives in script.js and is global.) Approvals also pulls
  // the latest pending list. The inline onclick already calls switchMode;
  // here we just close the menu and refresh on open.
  const menuSubmit = $("menuSubmitBtn");
  if (menuSubmit) menuSubmit.addEventListener("click", () => {
    closeUserMenu();
    adminAddMode = false;     // editing my own profile, not admin-adding
    editMode = false;         // open in read-only view first (if a profile exists)
    hydrateProfileForm();
  });
  const menuAdmin = $("menuAdminBtn");
  if (menuAdmin) menuAdmin.addEventListener("click", () => { closeUserMenu(); if (isAdmin) loadPending(); });

  // "Edit profile" on the view card flips into the editable form.
  const pvEdit = $("pvEditBtn");
  if (pvEdit) pvEdit.addEventListener("click", () => { editMode = true; hydrateProfileForm(); });

  const refreshBtn = $("adminRefreshBtn");
  if (refreshBtn) refreshBtn.addEventListener("click", loadPending);

  // Admin: "Add a student directly" opens the form in admin-add mode.
  const adminAddBtn = $("adminAddBtn");
  if (adminAddBtn) adminAddBtn.addEventListener("click", () => {
    if (!isAdmin) return;
    adminAddMode = true;
    editMode = true;
    if (typeof window.switchMode === "function") window.switchMode("submit");
    // Make sure the gate is bypassed (admin is signed in) and form is blank.
    const gate = $("submitLoginGate"); if (gate) gate.style.display = "none";
    const wrap = $("submitFormWrap"); if (wrap) wrap.style.display = "block";
    const f = $("submissionForm"); if (f) f.reset();
    hydrateProfileForm();
  });

  initSubmissionForm();
  updateAuthUI();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
