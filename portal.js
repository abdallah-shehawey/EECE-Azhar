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

/* ════════════════════════════════════════════
   § 1 — SMALL HELPERS
════════════════════════════════════════════ */
const $ = (id) => document.getElementById(id);

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

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  isAdmin = !!user && user.email === ADMIN_EMAIL;
  updateAuthUI();
  // If admin is already viewing the Approvals panel, refresh it.
  if (isAdmin && document.body.dataset.mode === "admin") loadPending();
});

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
      window.switchMode("countdown");
    }
  }

  // Admin-only menu item
  if (adminItem) adminItem.style.display = isAdmin ? "" : "none";

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
  const trackOtherCb = $("trackOtherCb");
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
  const trackCheckboxes = document.querySelectorAll(
    '#trackOptions input[type="checkbox"]',
  );

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
  function createTeamRow(isLeader = false) {
    const row = document.createElement("div");
    row.className = "team-member-row";
    const uid = Math.random().toString(36).substr(2, 9);
    row.innerHTML = `
        <input type="text" class="member-name" placeholder="Member Name" />
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

  /* — Track chips — */
  function getSelectedTracks() {
    const tracks = [];
    trackCheckboxes.forEach((cb) => {
      if (cb.checked && cb.value !== "other") tracks.push(cb.value);
    });
    if (trackOtherCb.checked) {
      inputTrackOther.value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((t) => tracks.push(t));
    }
    return tracks;
  }
  function renderTrackChips() {
    trackChips.innerHTML = "";
    getSelectedTracks().forEach((t) => {
      const c = document.createElement("span");
      c.className = "chip";
      c.textContent = t;
      trackChips.appendChild(c);
    });
  }
  trackCheckboxes.forEach((cb) => {
    cb.addEventListener("change", () => {
      if (cb.id === "trackOtherCb") {
        inputTrackOther.classList.toggle("hidden", !cb.checked);
        if (cb.checked) inputTrackOther.focus();
      }
      renderTrackChips();
    });
  });
  inputTrackOther.addEventListener("input", renderTrackChips);

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
  }

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
      if (formState.photoFile) {
        const firstName = inputName.value.trim().split(/\s+/)[0];
        formState.photoPath = sanitiseFileName(`${firstName}.webp`);
      }
      data = {
        type: "student",
        name: inputName.value.trim(),
        gender: $("inputGender").value,
        photo: formState.photoPath,
        tracks: getSelectedTracks(),
        color: formState.selectedColor,
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
      data = { type: "project", category: finalCategory, icon: $("inputIcon").value.trim(), team };
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

      // B — Save to /pending
      btnGenerate.querySelector(".btn-label").textContent = "⏳ Submitting…";
      await submitToPending(data);
      markStep($("step-code"), stepCodeStatus, true);
      setProgress(100);

      firebaseSuccess.classList.remove("hidden");
      form.reset();
      removePhoto();
      renderTrackChips();
      // Re-prefill name after reset
      if ($("inputName") && currentUser) $("inputName").value = currentUser.displayName || "";
      setTimeout(() => uploadProgress.classList.add("hidden"), 1600);
    } catch (err) {
      console.error("Submit error:", err);
      showValidation([`❌ Submission failed: ${err.message}`]);
      validationErrors.scrollIntoView({ behavior: "smooth", block: "center" });
      markStep($("step-photo"), stepPhotoStatus, false);
    } finally {
      formState.isUploading = false;
      btnGenerate.disabled = false;
      btnGenerate.querySelector(".btn-label").textContent = "⚡ Submit for Approval";
    }
  });

  // Live cleanup of invalid styling
  ["inputName", "inputLinkedin", "inputGithub", "inputWhatsapp", "inputFacebook"].forEach((id) => {
    const el = $(id);
    if (el) el.addEventListener("input", () => el.classList.remove("invalid"));
  });
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
    return {
      node: "students",
      key: sanitizeKey(data.name),
      payload: {
        name: data.name,
        photo: data.photo || "",
        track: data.tracks || [],
        color: data.color,
        gender: data.gender,
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
    payload: { category: data.category, icon: data.icon, team: teamObj },
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
  if (menuSubmit) menuSubmit.addEventListener("click", () => closeUserMenu());
  const menuAdmin = $("menuAdminBtn");
  if (menuAdmin) menuAdmin.addEventListener("click", () => { closeUserMenu(); if (isAdmin) loadPending(); });

  const refreshBtn = $("adminRefreshBtn");
  if (refreshBtn) refreshBtn.addEventListener("click", loadPending);

  initSubmissionForm();
  updateAuthUI();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
