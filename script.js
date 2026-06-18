// ===== Scroll Restoration Fix =====
// Always start from top on page load/refresh
if ("scrollRestoration" in history) history.scrollRestoration = "manual";

// ===== Target Dates =====
const EVENTS = {
  exam: {
    label: "Final Exam",
    date: new Date("2026-06-14T13:00:00"), // End time is 1:00 PM
  },
  discussion: {
    label: "Project Discussion",
    date: new Date("2026-07-04T10:00:00"),
  },
  party: {
    label: "Graduation Party",
    date: new Date("2026-07-22T10:00:00"),
  },
};

// ===== Firebase Realtime Database Config =====
// Replace this with your exact Firebase Realtime Database URL
const FIREBASE_DB_URL = "https://eece-azhar-6f18d-default-rtdb.firebaseio.com/";

// Offline cache — the service worker bypasses cross-origin (Firebase) requests,
// so the live DB never lands in the HTTP cache. We persist the last successful
// raw payload in localStorage and replay it when the network is unavailable, so
// the yearbook/projects still render fully offline.
const OFFLINE_CACHE_KEY = "eece-db-cache-v1";

function saveOfflineCache(payload) {
  try {
    localStorage.setItem(
      OFFLINE_CACHE_KEY,
      JSON.stringify({ ts: Date.now(), ...payload })
    );
  } catch (_) {
    // Quota / private-mode failures are non-fatal — we just skip the cache.
  }
}

function readOfflineCache() {
  try {
    const raw = localStorage.getItem(OFFLINE_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

// Hydrate the in-memory STUDENTS / GRADUATION_PROJECTS from a raw payload
// (either fresh from the network or replayed from the offline cache) and run
// every dependent re-render. Returns true when usable data was applied.
function applyDbPayload({ studentsData, projectsData, profilesData }) {
  if (studentsData == null && projectsData == null) return false;

  STUDENTS = mergeStudentSources(studentsData, profilesData);
  // Expose for the profile portal module (ES modules can't see top-level lets).
  window.STUDENTS = STUDENTS;

  if (projectsData) {
    GRADUATION_PROJECTS = Array.isArray(projectsData)
      ? projectsData.filter(Boolean)
      : Object.values(projectsData);

    GRADUATION_PROJECTS.forEach((project) => {
      if (project.team && !Array.isArray(project.team)) {
        project.team = Object.values(project.team);
      }
      applyHierarchyDefaults(project);
    });
  }
  // Expose for the portal module (ES module can't see top-level lets).
  window.GRADUATION_PROJECTS = GRADUATION_PROJECTS;

  // Patch photo URLs with the Cloudflare base URL now that we have data.
  if (typeof loadDrivePhotos === "function") loadDrivePhotos();

  // Rebuild cascading filters (fresh data may add new universities/years…).
  if (typeof buildYearbookFilters === "function") buildYearbookFilters();
  if (currentMode === "home" && typeof renderHomeStats === "function") renderHomeStats();

  // Re-render whichever view is currently active so it reflects the new data.
  if (typeof currentMode !== "undefined") {
    if (currentMode === "projects" && typeof renderProjects === "function") {
      renderProjects();
    } else if (currentMode === "yearbook" && typeof applyFilters === "function") {
      applyFilters(false);
    }
  }
  if (typeof renderStats === "function") renderStats();

  // A refresh landed on /profile before the data was ready — reopen it now.
  if (_pendingProfileKey && typeof openFullProfile === "function") {
    const s = (STUDENTS || []).find((st) => studentKey(st) === _pendingProfileKey);
    if (s) {
      openFullProfile(s);
      _pendingProfileKey = null;
    }
  }

  return true;
}

// Students and projects — populated by fetchFirebaseData()
let STUDENTS = [];
let GRADUATION_PROJECTS = [];

// Defaults for any legacy record that predates the institution/class-year
// system. Everyone already on the site belongs to this exact group.
const DEFAULT_CLASS_YEAR = "2026";
const DEFAULT_UNIVERSITY = "Al-Azhar University";
const DEFAULT_FACULTY = "Faculty of Engineering";
const DEFAULT_DEPARTMENT = "Communication & Electronics";

/** Fill any missing hierarchy fields on a student/profile record in place. */
function applyHierarchyDefaults(rec) {
  if (!rec.university) rec.university = DEFAULT_UNIVERSITY;
  if (!rec.faculty) rec.faculty = DEFAULT_FACULTY;
  if (!rec.department) rec.department = DEFAULT_DEPARTMENT;
  if (!rec.classYear) rec.classYear = DEFAULT_CLASS_YEAR;
  return rec;
}

/**
 * Merge legacy /students records with live /profiles records.
 * A profile (status === "live") is the source of truth and overrides any
 * /students record that shares the same key/owner. Returns a plain array.
 */
function mergeStudentSources(studentsData, profilesData) {
  const byKey = new Map();
  const nrm = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");

  // Keep the Firebase key on each legacy record (as _key) so we can target the
  // exact /students/<key> node later (e.g. to stamp ownerUid). Object.values
  // would otherwise lose the key.
  let legacy = [];
  if (Array.isArray(studentsData)) {
    legacy = studentsData.map((s, i) => (s ? { ...s, _key: String(i) } : null)).filter(Boolean);
  } else if (studentsData) {
    legacy = Object.entries(studentsData).map(([k, s]) => ({ ...s, _key: k }));
  }
  legacy.forEach((s) => {
    if (!s || !s.name) return;
    applyHierarchyDefaults(s);
    byKey.set(s.ownerUid || `name:${nrm(s.name)}`, s);
  });

  // Overlay live profiles. A profile is the source of truth, so it must REPLACE
  // any legacy /students card for the same person (matched by ownerUid, the
  // name key, or the assigned email) — otherwise the person shows up twice.
  if (profilesData) {
    Object.entries(profilesData).forEach(([uid, p]) => {
      if (!p || p.status !== "live" || !p.name) return;
      // Drop the legacy duplicates this profile supersedes.
      byKey.delete(`name:${nrm(p.name)}`);
      if (p.email) {
        for (const [k, v] of byKey) {
          if (!v.ownerUid && nrm(v.email) === nrm(p.email)) byKey.delete(k);
        }
      }
      byKey.set(uid, applyHierarchyDefaults({
        name: p.name,
        gender: p.gender || "",
        photo: p.photo || "",
        track: p.tracks || p.track || [],
        skills: p.skills || [],
        color: p.color || "",
        social: p.social || {},
        university: p.university,
        faculty: p.faculty,
        department: p.department,
        classYear: p.classYear,
        email: p.email || "",
        ownerUid: uid,
      }));
    });
  }

  return Array.from(byKey.values());
}

async function fetchFirebaseData({ attempt = 1, maxAttempts = 4, baseDelay = 2000 } = {}) {
  if (!FIREBASE_DB_URL || FIREBASE_DB_URL.includes("your-project")) return;

  const cleanUrl = FIREBASE_DB_URL.endsWith("/") ? FIREBASE_DB_URL : `${FIREBASE_DB_URL}/`;

  try {
    // Set a timeout of 8 seconds for the fetch so it doesn't hang forever
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const [resStudents, resProjects, resProfiles] = await Promise.all([
      fetch(`${cleanUrl}students.json`, { signal: controller.signal }),
      fetch(`${cleanUrl}projects.json`, { signal: controller.signal }),
      // Profiles are public-readable? No — guarded by rules. Anonymous read may
      // 401; treat that as "no profiles" and fall back to legacy students only.
      fetch(`${cleanUrl}profiles.json`, { signal: controller.signal }).catch(() => null),
    ]);

    clearTimeout(timeoutId);

    if (!resStudents.ok || !resProjects.ok) {
      throw new Error(`HTTP error! status: ${resStudents.status} / ${resProjects.status}`);
    }

    const studentsData = await resStudents.json();
    const projectsData = await resProjects.json();
    let profilesData = null;
    if (resProfiles && resProfiles.ok) {
      try { profilesData = await resProfiles.json(); } catch { profilesData = null; }
    }

    applyDbPayload({ studentsData, projectsData, profilesData });

    // Persist the raw payload so the site renders fully offline next time.
    saveOfflineCache({ studentsData, projectsData, profilesData });

    console.log(`Firebase data loaded successfully! (attempt ${attempt})`);

    // Now that Firebase data + critical re-renders are done, start caching
    // yearbook photos in the background. The prefetch function already uses
    // requestIdleCallback + batching so it won't block the main thread.
    prefetchStudentPhotos();

  } catch (error) {
    if (attempt < maxAttempts) {
      // Exponential backoff: 2s → 4s → 8s
      const delay = baseDelay * Math.pow(2, attempt - 1);
      console.warn(`Firebase fetch failed (attempt ${attempt}/${maxAttempts}), retrying in ${delay / 1000}s…`, error.message);
      setTimeout(() => fetchFirebaseData({ attempt: attempt + 1, maxAttempts, baseDelay }), delay);
    } else {
      // All network attempts failed (likely offline). Replay the last good
      // payload from localStorage so the yearbook/projects still render.
      const cached = readOfflineCache();
      if (cached && applyDbPayload(cached)) {
        console.info("Offline — rendered yearbook/projects from the local cache.");
        prefetchStudentPhotos();
      } else {
        console.warn(`Firebase fetch failed after ${maxAttempts} attempts and no offline cache was available:`, error.message);
      }
    }
  }
}


// ===== Cloudflare Photos Backend =====
// Replace this with your Cloudflare R2 bucket public URL
const CLOUDFLARE_BASE_URL = "https://pub-ce440e8089f54fd1b94098e019b0b3dd.r2.dev";
const CLOUDFLARE_IMAGE_EXT = ".jpg"; // e.g. .jpg, .png, .webp

async function loadDrivePhotos() {
  // Directly patch every student's photo field with the Cloudflare URL.
  STUDENTS.forEach((s) => {
    if (s.photo) {
      let key = s.photo.trim();
      // Skip URLs that are already patched (idempotent guard — prevents double-patching on retries)
      if (key.startsWith(CLOUDFLARE_BASE_URL)) return;
      // If you added the extension in students.js (e.g. "Islam.webp"), use it directly.
      // Otherwise, fallback to trying .jpg then .jpeg then .webp
      if (!key.includes('.')) {
        key += '.jpg';
      }
      s.photo = `${CLOUDFLARE_BASE_URL}/${key}`;
    }
  });
}

/**
 * Pre-loads student photos in small batches during idle time while the user
 * is on the countdown page, so images are already cached when they open the Yearbook.
 *
 * Batching (10 images per idle slot) prevents the ~3 GB RAM spike caused by
 * decoding all images simultaneously. The IntersectionObserver in renderYearbook()
 * acts as a safety net for any cards that become visible before their batch runs.
 */
function prefetchStudentPhotos() {
  const BATCH_SIZE = 10;
  const photos = STUDENTS.filter((s) => s.photo).map((s) => s.photo);
  if (!photos.length) return;
  let batchIndex = 0;

  function loadBatch() {
    if (batchIndex >= photos.length) return; // all done
    const batch = photos.slice(batchIndex, batchIndex + BATCH_SIZE);
    batchIndex += BATCH_SIZE;
    batch.forEach((src) => {
      const img = new Image();
      img.src = src;
    });
    // Schedule next batch during next idle window (generous timeout so it
    // never competes with user interactions)
    if (batchIndex < photos.length) {
      if (typeof requestIdleCallback === "function") {
        requestIdleCallback(loadBatch, { timeout: 8000 });
      } else {
        setTimeout(loadBatch, 2000);
      }
    }
  }

  // Start first batch after a short delay so the initial page render finishes first
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(loadBatch, { timeout: 5000 });
  } else {
    setTimeout(loadBatch, 3000);
  }
}

// ===== Yearbook =====
function getInitials(name) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

const SOCIAL_CONFIG = {
  linkedin: {
    icon: "icons/linkedin.svg",
    title: "LinkedIn",
    buildUrl: (v) => v,
  },
  whatsapp: {
    icon: "icons/whatsapp(1).png",
    title: "WhatsApp",
    buildUrl: (v) => `https://wa.me/${v.replace(/\D/g, "")}`,
  },
  facebook: {
    icon: "icons/facebook.svg",
    title: "Facebook",
    buildUrl: (v) => v,
  },
  github: { icon: "icons/github.svg", title: "GitHub", buildUrl: (v) => v },
  instagram: {
    icon: "icons/instagram.svg",
    title: "Instagram",
    buildUrl: (v) => v,
  },
  email: {
    icon: "icons/email.svg",
    title: "Email",
    buildUrl: (v) => `mailto:${v}`,
  },
};

// True when the current URL path is one of the transient overlay routes
// (/student → quick card, /profile → full profile). These aren't real
// sections; they sit on top of one and are driven by their open/close funcs.
function _isOverlayPath(name) {
  return location.pathname.replace(/^\/+|\/+$/g, "") === name;
}

// Scroll position of the underlying section, saved when an overlay (quick card
// / full profile) opens so we can land back on the SAME card after closing,
// instead of being thrown to the top of the grid.
let _overlayReturnScroll = null;

function openPhotoModal(student) {
  let modal = document.getElementById("photoModal");

  if (!modal) {
    modal = document.createElement("div");
    modal.id = "photoModal";
    modal.className = "photo-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-label", "Student details");

    modal.closeModal = (fromPopState = false) => {
      modal.classList.remove("active");
      setTimeout(() => (modal.style.display = "none"), 300);
      if (!fromPopState && _isOverlayPath("student")) {
        history.back();
      }
    };

    modal.addEventListener("click", (e) => {
      if (e.target === modal || e.target.className === "photo-modal-close") {
        modal.closeModal();
      }
    });

    // Keyboard activation of the close button (Enter / Space)
    modal.addEventListener("keydown", (e) => {
      if (
        (e.key === "Enter" || e.key === " ") &&
        e.target.classList.contains("photo-modal-close")
      ) {
        e.preventDefault();
        modal.closeModal();
      }
    });

    // Close on Escape key
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modal.style.display === "flex") {
        modal.closeModal();
      }
    });

    // Handle hardware back button
    window.addEventListener("popstate", (e) => {
      if (modal.style.display === "flex" && !_isOverlayPath("student")) {
        modal.closeModal(true);
      }
    });

    document.body.appendChild(modal);
  }

  const isAvatar = !student.photo;

  // ── Generate Tracks HTML ──
  let tracksHtml = "";
  let tracks = student.track;
  if (tracks) {
    if (!Array.isArray(tracks)) tracks = [tracks];
    const badges = tracks
      .map((t) => `<span class="student-track">${t}</span>`)
      .join("");
    tracksHtml = `<div class="student-track-container">${badges}</div>`;
  }

  // ── Institution meta (university · department · class year) ──
  let metaHtml = "";
  const metaBits = [
    student.university || "Al-Azhar University",
    student.department,
    student.classYear ? `Class of ${student.classYear}` : "",
  ].filter(Boolean);
  if (metaBits.length) metaHtml = `<p class="modal-meta">${metaBits.join(" · ")}</p>`;

  // Skills are NOT shown in the quick card modal — they live on the full profile.
  const skillsHtml = "";

  // ── Team Leader Badge HTML ──
  const leaderBadgeHtml = student.teamLeader
    ? `<div class="modal-leader-badge">
               <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
               Team Leader
           </div>`
    : "";

  // ── Generate Social Buttons HTML ──
  let socialHtml = "";
  if (student.social) {
    const btns = Object.entries(student.social)
      .map(([platform, value]) => {
        if (!value) return "";
        const cfg = SOCIAL_CONFIG[platform];
        if (!cfg) return "";
        return `
                <a class="social-btn social-${platform}" href="${cfg.buildUrl(value)}" target="_blank" rel="noopener noreferrer" title="${cfg.title}">
                    <img src="${cfg.icon}" alt="${cfg.title}" class="social-icon" />
                </a>
            `;
      })
      .join("");
    if (btns) {
      socialHtml = `<div class="social-links">${btns}</div>`;
    }
  }

  // Build the photo element with retry logic if needed
  let photoHtml;
  if (isAvatar) {
    photoHtml = `<div class="photo-modal-avatar" style="background: ${student.color}">${getInitials(student.name)}</div>`;
  } else {
    photoHtml = `<div class="photo-modal-avatar" style="background: ${student.color}" id="_modalAvatarFallback">${getInitials(student.name)}</div>
      <img id="_modalPhotoImg" alt="${student.name}" style="display:none" />`;
  }

  modal.setAttribute("aria-label", `${student.name} — details`);
  modal.innerHTML = `
        <span class="photo-modal-close" role="button" tabindex="0" aria-label="Close">&times;</span>
        <div class="photo-modal-content">
            ${photoHtml}
            <h3>${student.name}</h3>
            ${leaderBadgeHtml}
            ${metaHtml}
            ${tracksHtml}
            ${skillsHtml}
            ${socialHtml}
            <button type="button" class="modal-view-profile" id="_modalViewProfile">View full profile →</button>
        </div>
    `;
  // "View full profile" → close this quick modal, open the full profile page.
  const vpBtn = modal.querySelector("#_modalViewProfile");
  if (vpBtn) vpBtn.addEventListener("click", () => {
    // Close the quick modal WITHOUT triggering its own history.back() — we
    // replace the lingering #student entry with #profile inside openFullProfile.
    modal.closeModal(true);
    if (typeof openFullProfile === "function") openFullProfile(student);
  });

  // Retry logic for modal image
  if (!isAvatar) {
    const modalImg = modal.querySelector("#_modalPhotoImg");
    const modalAv = modal.querySelector("#_modalAvatarFallback");
    let modalRetry = 0;
    const MAX_MODAL_RETRIES = 3;
    const MODAL_DELAYS = [2000, 4000, 8000];

    function tryModalLoad() {
      let url = student.photo;
      if (modalRetry === 1) {
        url = url.replace(/\.jpg$/i, '.jpeg'); // Try .jpeg on first retry
      } else if (modalRetry === 2) {
        url = url.replace(/\.jpg$/i, '.webp'); // Try .webp on second retry
      } else if (modalRetry > 2) {
        const sep = url.includes("?") ? "&" : "?";
        url = url.replace(/\.jpg$/i, '.webp') + sep + "_r=" + modalRetry;
      }
      // Attach handlers BEFORE setting src — prevents race with cached images firing onload immediately
      modalImg.onload = () => {
        modalImg.style.display = "";
        if (modalAv) modalAv.style.display = "none";
      };
      modalImg.onerror = () => {
        if (modalRetry < MAX_MODAL_RETRIES && modal.style.display === "flex") {
          setTimeout(() => {
            modalRetry++;
            tryModalLoad();
          }, MODAL_DELAYS[modalRetry] || 8000);
        }
      };
      modalImg.src = url; // set src last — handlers already in place
    }
    tryModalLoad();
  }

  modal.style.display = "flex";
  // Trigger reflow for animation
  void modal.offsetWidth;
  modal.classList.add("active");

  // Add state to browser history for mobile back button
  if (!_isOverlayPath("student")) {
    // Remember where the user was in the grid so closing returns to the same
    // card rather than scrolling back to the very first one.
    if (!_isOverlayPath("profile")) _overlayReturnScroll = window.scrollY;
    history.pushState({ overlay: "student" }, "", "/student");
  }
}

// ===== Contact / complaint modal =====
function openContactModal() {
  const modal = document.getElementById("contactModal");
  if (!modal) return;
  modal.style.display = "flex";
  const status = document.getElementById("cfStatus");
  if (status) { status.style.display = "none"; status.textContent = ""; }
  const msg = document.getElementById("cfMessage");
  if (msg) setTimeout(() => msg.focus(), 50);
}
function closeContactModal() {
  const modal = document.getElementById("contactModal");
  if (modal) modal.style.display = "none";
}
function initContactForm() {
  const modal = document.getElementById("contactModal");
  const form = document.getElementById("contactForm");
  const closeBtn = document.getElementById("contactClose");
  if (!modal || !form) return;
  closeBtn?.addEventListener("click", closeContactModal);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeContactModal(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.style.display === "flex") closeContactModal();
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const status = document.getElementById("cfStatus");
    const btn = document.getElementById("cfSubmit");
    const message = document.getElementById("cfMessage").value.trim();
    if (!message) {
      if (status) { status.style.display = "block"; status.className = "contact-status err"; status.textContent = "Please write a message first."; }
      return;
    }
    btn.disabled = true; btn.textContent = "Sending…";
    try {
      const res = await fetch("/api/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "contact",
          name: document.getElementById("cfName").value.trim(),
          email: document.getElementById("cfEmail").value.trim(),
          message,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Error ${res.status}`);
      if (status) { status.style.display = "block"; status.className = "contact-status ok"; status.textContent = "✓ Sent! We'll get back to you soon."; }
      form.reset();
      setTimeout(closeContactModal, 1600);
    } catch (err) {
      if (status) { status.style.display = "block"; status.className = "contact-status err"; status.textContent = "Couldn't send: " + err.message; }
    } finally {
      btn.disabled = false; btn.textContent = "Send message";
    }
  });
}

// ===== Full profile page (Facebook-style, About / Graduation Project tabs) =====
let _fpReturnMode = "yearbook";
// Set when a refresh landed on /profile but the student data isn't loaded yet;
// the next applyDbPayload() reopens that profile once the data arrives.
let _pendingProfileKey = null;

// A stable key for a student so a profile survives a page refresh. Prefer the
// auth uid (unique); fall back to the normalised name (unique in practice).
function studentKey(student) {
  if (!student) return "";
  if (student.ownerUid) return `uid:${student.ownerUid}`;
  return `name:${String(student.name || "").trim().toLowerCase().replace(/\s+/g, " ")}`;
}
function findStudentByKey(key) {
  if (!key) return null;
  return (STUDENTS || []).find((s) => studentKey(s) === key) || null;
}

function openFullProfile(student) {
  const page = document.getElementById("fullProfile");
  if (!page || !student) return;
  _fpReturnMode = currentMode || "yearbook";

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const initials = (student.name || "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  // Avatar
  const av = document.getElementById("fpAvatar");
  if (av) {
    if (student.photo) {
      const url = String(student.photo).startsWith("http") ? student.photo : `${CLOUDFLARE_BASE_URL}/${student.photo}`;
      av.style.background = `center/cover no-repeat url("${url}")`;
      av.textContent = "";
    } else {
      av.style.background = student.color || "var(--gradient-2)";
      av.textContent = initials;
    }
  }
  setEl("fpName", student.name || "");
  setEl("fpSub", [student.department, student.classYear ? `Class of ${student.classYear}` : ""].filter(Boolean).join(" · "));
  setEl("fpUniversity", student.university || "Al-Azhar University");
  setEl("fpFaculty", student.faculty || "Faculty of Engineering");
  setEl("fpDepartment", student.department || "Communication & Electronics");
  setEl("fpClassYear", student.classYear || "2026");

  const chips = (arr, cls) => {
    let a = arr; if (!Array.isArray(a)) a = a ? [a] : [];
    return a.map((x) => `<span class="${cls}">${esc(x)}</span>`).join("");
  };
  fpBlock("fpTracksWrap", "fpTracks", chips(student.track, "chip"));
  fpBlock("fpSkillsWrap", "fpSkills", chips(student.skills, "chip chip-skill"));

  // Social
  const soc = student.social || {};
  const socialHtml = Object.entries(soc).map(([platform, value]) => {
    if (!value) return "";
    const cfg = SOCIAL_CONFIG[platform];
    if (!cfg) return "";
    return `<a class="social-btn social-${platform}" href="${cfg.buildUrl(value)}" target="_blank" rel="noopener noreferrer" title="${cfg.title}"><img src="${cfg.icon}" alt="${cfg.title}" class="social-icon" /></a>`;
  }).join("");
  fpBlock("fpSocialWrap", "fpSocial", socialHtml);

  // Graduation project tab (only if this person is on a team)
  const projTabBtn = document.getElementById("fpProjectTabBtn");
  const projPanel = document.getElementById("fpProject");
  const norm = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
  const mine = norm(student.name);
  const projects = (GRADUATION_PROJECTS || []).filter((p) => {
    const team = Array.isArray(p.team) ? p.team : Object.values(p.team || {});
    return team.some((m) => norm(m.name) === mine);
  });
  if (projects.length && projTabBtn && projPanel) {
    projTabBtn.style.display = "";
    // Look up each member's full yearbook record so we can show their photo and
    // open their card on click. Matched by normalised name.
    const studentByName = new Map((STUDENTS || []).map((s) => [norm(s.name), s]));
    const memberTile = (m) => {
      const rec = studentByName.get(norm(m.name));
      const ini = (m.name || "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
      let avatar;
      if (rec && rec.photo) {
        const url = String(rec.photo).startsWith("http") ? rec.photo : `${CLOUDFLARE_BASE_URL}/${rec.photo}`;
        avatar = `<span class="fp-member-av" style='background:center/cover no-repeat url("${url}")'></span>`;
      } else {
        avatar = `<span class="fp-member-av" style="background:${(rec && rec.color) || "var(--gradient-2)"}">${ini}</span>`;
      }
      // data-name lets the click handler find the student record to open.
      return `<button type="button" class="fp-member${m.leader ? " is-leader" : ""}" data-name="${esc(m.name)}">
        ${avatar}<span class="fp-member-name">${m.leader ? "★ " : ""}${esc(m.name)}</span>
      </button>`;
    };
    projPanel.innerHTML = projects.map((p) => {
      const team = Array.isArray(p.team) ? p.team : Object.values(p.team || {});
      const members = team.map(memberTile).join("");
      const repo = p.repo ? `<a class="fp-repo" href="${esc(p.repo)}" target="_blank" rel="noopener noreferrer">🔗 GitHub Repository</a>` : "";
      const desc = p.description ? `<p class="fp-proj-desc">${esc(p.description)}</p>` : `<p class="fp-proj-desc fp-muted">No description yet.</p>`;
      return `<div class="fp-proj-card">
        <div class="fp-proj-head">${esc(p.icon || "🚀")} <strong>${esc(p.category || "Project")}</strong> <span class="fp-proj-year">${esc(p.classYear || "")}</span></div>
        ${desc}${repo}
        <h4 class="fp-proj-team-title">Team</h4>
        <div class="fp-member-grid">${members}</div>
      </div>`;
    }).join("");
    // Clicking a registered member opens THEIR quick card (the photo modal) on
    // top of this profile — from there the visitor can choose to open the full
    // profile if they want. Non-registered names aren't clickable.
    projPanel.querySelectorAll(".fp-member").forEach((btn) => {
      const rec = studentByName.get(norm(btn.dataset.name));
      if (!rec) { btn.classList.add("fp-member-static"); btn.disabled = true; return; }
      btn.addEventListener("click", () => openPhotoModal(rec));
    });
  } else if (projTabBtn && projPanel) {
    projTabBtn.style.display = "none";
    projPanel.innerHTML = "";
  }

  // Edit button only for the profile owner (portal exposes the current uid).
  const editBtn = document.getElementById("fpEditBtn");
  if (editBtn) {
    const isOwner = window.__myUid && student.ownerUid && window.__myUid === student.ownerUid;
    editBtn.style.display = isOwner ? "" : "none";
    editBtn.onclick = () => { closeFullProfile(); if (typeof window.openMyProfileEdit === "function") window.openMyProfileEdit(); };
  }

  fpShowTab("about");
  page.style.display = "block";
  document.body.classList.add("fp-open");
  // Remember the grid scroll position before the profile takes over the screen,
  // so closing the profile lands back on the same card. (When we arrived via the
  // quick card, openPhotoModal already captured it — don't clobber that.)
  if (!_isOverlayPath("student") && !_isOverlayPath("profile")) {
    _overlayReturnScroll = window.scrollY;
  }
  window.scrollTo(0, 0);
  // Remember which profile is open + which section it sits on, so a page
  // refresh on /profile can reopen the same profile instead of dumping the
  // user back on the yearbook. (sessionStorage survives reloads; history.state
  // alone can be dropped by some browsers on a hard refresh.)
  const profileState = { mode: "profile-view", from: _fpReturnMode, student: studentKey(student) };
  try { sessionStorage.setItem("eece-open-profile", JSON.stringify(profileState)); } catch (_) {}
  // History: if we came from the quick modal it left a /student entry behind —
  // replace it (so Back lands on the section, not a closed modal). Otherwise
  // push a fresh entry on top of the current section.
  if (_isOverlayPath("student")) {
    history.replaceState(profileState, "", "/profile");
  } else {
    history.pushState(profileState, "", "/profile");
  }
}
function closeFullProfile() {
  const page = document.getElementById("fullProfile");
  if (page) page.style.display = "none";
  document.body.classList.remove("fp-open");
  try { sessionStorage.removeItem("eece-open-profile"); } catch (_) {}
}
function fpShowTab(tab) {
  document.querySelectorAll(".fp-tab").forEach((b) => b.classList.toggle("active", b.dataset.fptab === tab));
  const about = document.getElementById("fpAbout");
  const proj = document.getElementById("fpProject");
  if (about) about.style.display = tab === "about" ? "" : "none";
  if (proj) proj.style.display = tab === "project" ? "" : "none";
}
function initFullProfile() {
  const back = document.getElementById("fpBack");
  if (back) back.addEventListener("click", () => { closeFullProfile(); history.back(); });
  document.querySelectorAll(".fp-tab").forEach((b) => {
    b.addEventListener("click", () => fpShowTab(b.dataset.fptab));
  });
}
function setEl(id, t) { const el = document.getElementById(id); if (el) el.textContent = t; }
function fpBlock(wrapId, innerId, html) {
  const wrap = document.getElementById(wrapId), inner = document.getElementById(innerId);
  if (inner) inner.innerHTML = html;
  if (wrap) wrap.style.display = html ? "" : "none";
}

function renderYearbook(list = STUDENTS, animate = true) {
  const grid = document.getElementById("studentsGrid");
  const noResults = document.getElementById("noResults");
  if (!grid) return;
  grid.innerHTML = "";

  if (list.length === 0) {
    noResults.style.display = "block";
    return;
  }
  noResults.style.display = "none";

  list.forEach((student, i) => {
    const card = document.createElement("div");
    card.className = "student-card";
    // Entrance animation plays on fresh entry + every filter/search change
    // (the user WANTS the grid to "re-open" then). It's skipped only when
    // returning from a card/profile so the grid stays put on the way back.
    if (animate) {
      card.style.animation = "fadeInUp 0.5s ease-out both";
      card.style.animationDelay = `${(i % 10) * 0.06}s`; // cycle delay so it doesn't get too long
    }

    const photoWrap = document.createElement("div");
    photoWrap.className = "student-photo-wrap";

    card.style.cursor = "pointer";
    card.title = "Click to view details";
    card.addEventListener("click", (e) => {
      if (!e.target.closest(".social-btn")) {
        openPhotoModal(student);
      }
    });

    if (student.photo) {
      // Avatar placeholder shown immediately; real photo loads only when card enters viewport
      const av = document.createElement("div");
      av.className = "student-avatar";
      av.style.background = student.color;
      av.textContent = getInitials(student.name);
      photoWrap.appendChild(av);

      const img = document.createElement("img");
      img.className = "student-photo";
      img.alt = student.name;
      img.decoding = "async";
      img.style.display = "none"; // hidden until loaded
      photoWrap.appendChild(img);

      let retryCount = 0;
      let cancelled = false;
      const MAX_RETRIES = 3;
      const RETRY_DELAYS = [2000, 4000, 8000];
      const unwatch = _watchCardRemoval(card, "studentsGrid", () => { cancelled = true; });

      function tryLoad() {
        if (cancelled) return;
        let url = student.photo;
        if (retryCount === 1) url = url.replace(/\.jpg$/i, '.jpeg');
        else if (retryCount === 2) url = url.replace(/\.jpg$/i, '.webp');
        else if (retryCount > 2) {
          const sep = url.includes("?") ? "&" : "?";
          url = url.replace(/\.jpg$/i, '.webp') + sep + "_r=" + retryCount;
        }
        img.onload = () => {
          if (cancelled) return;
          img.style.display = "";
          if (photoWrap.contains(av)) photoWrap.replaceChild(img, av);
          unwatch();
        };
        img.onerror = () => {
          if (cancelled) return;
          if (retryCount < MAX_RETRIES) {
            setTimeout(() => { retryCount++; tryLoad(); }, RETRY_DELAYS[retryCount] || 8000);
          }
        };
        img.src = url;
      }

      // ── Lazy load: start fetching only when card enters the viewport ──
      const io = new IntersectionObserver((entries, obs) => {
        if (entries[0].isIntersecting) {
          obs.disconnect();
          tryLoad();
        }
      }, { rootMargin: "200px" }); // start loading 200px before visible
      io.observe(card);

    } else {
      const av = document.createElement("div");
      av.className = "student-avatar";
      av.style.background = student.color;
      av.textContent = getInitials(student.name);
      photoWrap.appendChild(av);
    }

    const nameEl = document.createElement("p");
    nameEl.className = "student-name";
    nameEl.textContent = student.name;

    // University (small meta line under the name).
    const uniEl = document.createElement("p");
    uniEl.className = "student-uni";
    uniEl.textContent = student.university || "Al-Azhar University";

    const trackContainer = document.createElement("div");
    trackContainer.className = "student-track-container";

    let tracks = student.track;
    if (tracks) {
      if (!Array.isArray(tracks)) tracks = [tracks];
      tracks.forEach((trackName) => {
        const trackEl = document.createElement("span");
        trackEl.className = "student-track";
        trackEl.textContent = trackName;
        trackContainer.appendChild(trackEl);
      });
    }

    const socialRow = document.createElement("div");
    socialRow.className = "social-links";

    if (student.social) {
      Object.entries(student.social).forEach(([platform, value]) => {
        if (!value) return;
        const cfg = SOCIAL_CONFIG[platform];
        if (!cfg) return;

        const a = document.createElement("a");
        a.className = `social-btn social-${platform}`;
        a.href = cfg.buildUrl(value);
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.title = cfg.title;

        const img = document.createElement("img");
        img.src = cfg.icon;
        img.alt = cfg.title;
        img.className = "social-icon";
        a.appendChild(img);

        socialRow.appendChild(a);
      });
    }

    card.appendChild(photoWrap);
    card.appendChild(nameEl);
    card.appendChild(uniEl);
    if (trackContainer.children.length > 0) card.appendChild(trackContainer);
    if (socialRow.children.length > 0) card.appendChild(socialRow);

    // Admin-only delete button (the portal module exposes window.__isAdmin
    // and window.adminDeleteStudent). Hidden for everyone else.
    if (window.__isAdmin && typeof window.adminDeleteStudent === "function") {
      const del = document.createElement("button");
      del.type = "button";
      del.className = "card-delete-btn";
      del.title = "Delete this student";
      del.setAttribute("aria-label", `Delete ${student.name}`);
      del.textContent = "🗑";
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        window.adminDeleteStudent(student);
      });
      card.appendChild(del);
    }

    grid.appendChild(card);
  });
}

let selectedCategories = new Set();
let currentSearchQuery = "";

// ===== Hierarchical Yearbook filters (University › Faculty › Department › Year) =====
// "" means "All" at that level. Gender is "all" | "male" | "female".
const yearbookFilter = {
  university: "",
  faculty: "",
  department: "",
  classYear: "",
  gender: "all",
};
let _filtersInitialised = false;

// Order class years newest-first ("2027" before "2026"); non-numeric sort last.
function _sortYearsDesc(years) {
  return [...years].sort((a, b) => {
    const na = parseInt(a, 10), nb = parseInt(b, 10);
    if (isNaN(na) && isNaN(nb)) return a.localeCompare(b);
    if (isNaN(na)) return 1;
    if (isNaN(nb)) return -1;
    return nb - na;
  });
}

// Distinct, sorted values for a field among students that match the
// currently-selected higher levels (so each dropdown only shows real options).
function _availableValues(field, scope = {}) {
  const set = new Set();
  STUDENTS.forEach((s) => {
    if (scope.university && (s.university || DEFAULT_UNIVERSITY) !== scope.university) return;
    if (scope.faculty && (s.faculty || DEFAULT_FACULTY) !== scope.faculty) return;
    if (scope.department && (s.department || DEFAULT_DEPARTMENT) !== scope.department) return;
    const v = s[field];
    if (v) set.add(v);
  });
  return Array.from(set);
}

// Build / refresh the cascading <select>s. Called after data loads and whenever
// a higher level changes. Picks sensible defaults (single option auto-selected,
// newest class year by default) and only renders levels that have >1 real value.
function buildYearbookFilters() {
  const uniSel = document.getElementById("filterUniversity");
  const facSel = document.getElementById("filterFaculty");
  const depSel = document.getElementById("filterDepartment");
  const yrSel = document.getElementById("filterClassYear");
  if (!uniSel || !facSel || !depSel || !yrSel) return;

  const fill = (sel, values, current, { sort = "asc" } = {}) => {
    let vals = sort === "yearDesc" ? _sortYearsDesc(values) : [...values].sort((a, b) => a.localeCompare(b));
    // Reset selection if the current value is no longer valid.
    if (current && !vals.includes(current)) current = "";
    const opts = [`<option value="">All</option>`]
      .concat(vals.map((v) => `<option value="${v}"${v === current ? " selected" : ""}>${v}</option>`));
    sel.innerHTML = opts.join("");
    // Hide a level entirely if there's only one real value (nothing to choose).
    const wrap = sel.closest(".yb-filter");
    if (wrap) wrap.style.display = vals.length > 1 ? "" : "none";
    return current;
  };

  const universities = _availableValues("university");
  yearbookFilter.university = fill(uniSel, universities, yearbookFilter.university);

  const faculties = _availableValues("faculty", { university: yearbookFilter.university });
  yearbookFilter.faculty = fill(facSel, faculties, yearbookFilter.faculty);

  const departments = _availableValues("department", {
    university: yearbookFilter.university,
    faculty: yearbookFilter.faculty,
  });
  yearbookFilter.department = fill(depSel, departments, yearbookFilter.department);

  const years = _availableValues("classYear", {
    university: yearbookFilter.university,
    faculty: yearbookFilter.faculty,
    department: yearbookFilter.department,
  });
  // Default to the newest class year that actually has people (only on first build).
  if (!_filtersInitialised && years.length) {
    yearbookFilter.classYear = _sortYearsDesc(years)[0];
  }
  yearbookFilter.classYear = fill(yrSel, years, yearbookFilter.classYear, { sort: "yearDesc" });

  // Gender toggle only matters when both genders exist in the current scope.
  refreshGenderToggle();

  _filtersInitialised = true;
}

// Show the gender toggle only if the current scope has both male and female.
function refreshGenderToggle() {
  const toggle = document.getElementById("genderToggle");
  if (!toggle) return;
  const genders = new Set();
  STUDENTS.forEach((s) => {
    if (yearbookFilter.university && (s.university || DEFAULT_UNIVERSITY) !== yearbookFilter.university) return;
    if (yearbookFilter.faculty && (s.faculty || DEFAULT_FACULTY) !== yearbookFilter.faculty) return;
    if (yearbookFilter.department && (s.department || DEFAULT_DEPARTMENT) !== yearbookFilter.department) return;
    if (yearbookFilter.classYear && (s.classYear || DEFAULT_CLASS_YEAR) !== yearbookFilter.classYear) return;
    if (s.gender) genders.add(s.gender.toLowerCase());
  });
  const bothGenders = genders.has("male") && genders.has("female");
  toggle.style.display = bothGenders ? "" : "none";
  if (!bothGenders && yearbookFilter.gender !== "all") {
    yearbookFilter.gender = "all";
    toggle.querySelectorAll(".gender-btn").forEach((b) =>
      b.classList.toggle("active", b.dataset.gender === "all"));
  }
}

// Wire the filter controls (called once at init).
function initYearbookFilters() {
  const ids = {
    university: "filterUniversity",
    faculty: "filterFaculty",
    department: "filterDepartment",
    classYear: "filterClassYear",
  };
  Object.entries(ids).forEach(([field, id]) => {
    const sel = document.getElementById(id);
    if (!sel) return;
    sel.addEventListener("change", () => {
      yearbookFilter[field] = sel.value;
      // Changing a higher level invalidates lower selections; rebuild cascade.
      if (field === "university") { yearbookFilter.faculty = ""; yearbookFilter.department = ""; yearbookFilter.classYear = ""; }
      else if (field === "faculty") { yearbookFilter.department = ""; yearbookFilter.classYear = ""; }
      else if (field === "department") { yearbookFilter.classYear = ""; }
      buildYearbookFilters();
      renderStats();
      applyFilters();
    });
  });

  const toggle = document.getElementById("genderToggle");
  if (toggle) {
    toggle.querySelectorAll(".gender-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        yearbookFilter.gender = btn.dataset.gender;
        toggle.querySelectorAll(".gender-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        applyFilters();
      });
    });
  }
}

// Does a student pass the current hierarchy + gender filters?
function matchesYearbookScope(s) {
  if (yearbookFilter.university && (s.university || DEFAULT_UNIVERSITY) !== yearbookFilter.university) return false;
  if (yearbookFilter.faculty && (s.faculty || DEFAULT_FACULTY) !== yearbookFilter.faculty) return false;
  if (yearbookFilter.department && (s.department || DEFAULT_DEPARTMENT) !== yearbookFilter.department) return false;
  if (yearbookFilter.classYear && (s.classYear || DEFAULT_CLASS_YEAR) !== yearbookFilter.classYear) return false;
  if (yearbookFilter.gender !== "all" && (s.gender || "").toLowerCase() !== yearbookFilter.gender) return false;
  return true;
}

function getStudentCategories(student) {
  let tracks = student.track;
  if (!tracks) return new Set();
  if (!Array.isArray(tracks)) tracks = [tracks];

  let categories = new Set();
  tracks.forEach((track) => {
    const t = track.toLowerCase();
    if (t.includes("embedded")) categories.add("Embedded");
    else if (t.includes("digital") || t.includes("ic") || t.includes("asic"))
      categories.add("Digital Design");
    else if (t.includes("network")) categories.add("Network");
    else if (t.includes("ai")) categories.add("AI");
    else if (t.includes("devops")) categories.add("DevOps");
    else if (t.includes("test")) categories.add("Software Testing");
    else categories.add(track);
  });
  return categories;
}

function renderStats() {
  const statsContainer = document.getElementById("yearbookStats");
  if (!statsContainer) return;

  // Only count students within the active hierarchy/gender scope so the track
  // tiles reflect the group the visitor is actually looking at.
  const scoped = STUDENTS.filter(matchesYearbookScope);

  let trackCounts = {};
  scoped.forEach((s) => {
    const cats = getStudentCategories(s);
    cats.forEach((cat) => {
      trackCounts[cat] = (trackCounts[cat] || 0) + 1;
    });
  });

  const statsData = [
    { category: "All", label: "Students", count: scoped.length },
  ];

  // Sort tracks by count (descending)
  const sortedCategories = Object.entries(trackCounts).sort(
    (a, b) => b[1] - a[1],
  );

  sortedCategories.forEach(([cat, count]) => {
    let label = cat;
    if (
      cat === "Embedded" ||
      cat === "AI" ||
      cat === "Network" ||
      cat === "DevOps"
    ) {
      label += " Engineers";
    } else if (cat === "Digital Design") {
      label = "Digital Designers";
    }
    statsData.push({ category: cat, label: label, count: count });
  });

  statsContainer.innerHTML = statsData
    .map((stat) => {
      const isActive =
        stat.category === "All"
          ? selectedCategories.size === 0
          : selectedCategories.has(stat.category);
      return `
        <button type="button" class="stat-item ${isActive ? "active-filter" : ""}" data-category="${stat.category}" aria-pressed="${isActive}" onclick="toggleCategoryFilter('${stat.category}')">
            <span class="stat-label">${stat.label}</span>
            <span class="stat-number" data-target="${stat.count}">0</span>
        </button>
        `;
    })
    .join("");

  // Animate counters
  const statNumbers = document.querySelectorAll(".stat-number");
  statNumbers.forEach((el) => {
    const target = +el.getAttribute("data-target");
    const duration = 1500; // ms
    const frameDuration = 1000 / 60;
    const totalFrames = Math.round(duration / frameDuration);
    let frame = 0;

    const counter = setInterval(() => {
      frame++;
      const progress = frame / totalFrames;
      const easeOut = 1 - (1 - progress) * (1 - progress);
      const currentCount = Math.round(target * easeOut);

      el.textContent = currentCount;
      if (frame >= totalFrames) {
        el.textContent = target;
        clearInterval(counter);
      }
    }, frameDuration);
  });
}

function toggleCategoryFilter(cat) {
  if (cat === "All") {
    selectedCategories.clear();
  } else {
    if (selectedCategories.has(cat)) {
      selectedCategories.delete(cat);
    } else {
      selectedCategories.add(cat);
    }
  }

  const statItems = document.querySelectorAll(".stat-item");
  statItems.forEach((item) => {
    const itemCat = item.getAttribute("data-category");
    const on =
      itemCat === "All"
        ? selectedCategories.size === 0
        : selectedCategories.has(itemCat);
    item.classList.toggle("active-filter", on);
    item.setAttribute("aria-pressed", String(on));
  });

  applyFilters();
}

function filterStudents(query) {
  currentSearchQuery = query.trim().toLowerCase();
  applyFilters();
}

function applyFilters(animate = true) {
  const filtered = STUDENTS.filter((s) => {
    // Hierarchy + gender scope (University › Faculty › Department › Year, gender)
    if (!matchesYearbookScope(s)) return false;

    // Text search
    let matchesText = true;
    if (currentSearchQuery) {
      const inName = s.name.toLowerCase().includes(currentSearchQuery);
      let inTrack = false;
      if (s.track) {
        const tracks = Array.isArray(s.track) ? s.track : [s.track];
        inTrack = tracks.some((t) =>
          t.toLowerCase().includes(currentSearchQuery),
        );
      }
      matchesText = inName || inTrack;
    }

    // Category search (OR logic if multiple selected)
    let matchesCategory = true;
    if (selectedCategories.size > 0) {
      const sCats = getStudentCategories(s);
      matchesCategory = Array.from(selectedCategories).some((c) =>
        sCats.has(c),
      );
    }

    return matchesText && matchesCategory;
  });

  // Sort alphabetically, but always keep Abdallah Shehawey first
  filtered.sort((a, b) => {
    const PINNED = "abdallah shehawey";
    const aPin = a.name.toLowerCase() === PINNED;
    const bPin = b.name.toLowerCase() === PINNED;
    if (aPin) return -1;
    if (bPin) return 1;
    return a.name.localeCompare(b.name);
  });

  renderYearbook(filtered, animate);
  updateYearbookHeading();
}

// Reflect the active scope in the Yearbook heading + subtitle.
function updateYearbookHeading() {
  const titleEl = document.querySelector("#mode-yearbook .yearbook-title");
  const subEl = document.querySelector("#mode-yearbook .yearbook-subtitle");
  if (titleEl) {
    // Keep the camera icon, replace only the trailing text node.
    const yr = yearbookFilter.classYear || "All Years";
    const label = yearbookFilter.classYear ? `Class of ${yr}` : "All Classes";
    let textNode = [...titleEl.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
    if (textNode) textNode.textContent = " " + label;
    else titleEl.appendChild(document.createTextNode(" " + label));
  }
  if (subEl) {
    const parts = [
      yearbookFilter.university || DEFAULT_UNIVERSITY,
      yearbookFilter.faculty || DEFAULT_FACULTY,
      yearbookFilter.department || DEFAULT_DEPARTMENT,
    ];
    subEl.textContent = parts.join(" · ");
  }
}

// ===== Home page live stats =====
function renderHomeStats() {
  const set = (id, n) => {
    const el = document.getElementById(id);
    if (el) animateCount(el, n);
  };
  const unis = new Set(STUDENTS.map((s) => s.university || DEFAULT_UNIVERSITY));
  const years = new Set(STUDENTS.map((s) => s.classYear || DEFAULT_CLASS_YEAR));
  set("statStudents", STUDENTS.length);
  set("statProjects", GRADUATION_PROJECTS.length);
  set("statUniversities", unis.size);
  set("statYears", years.size);

  renderHomeTrackBreakdown();
}

// Normalise a track name so trivial variants merge into one bucket:
// case-insensitive, trims, collapses spaces, and singularises a trailing "s"
// ("Embedded Systems" === "Embedded System", "Network Security" === "Network security").
// Words that legitimately end in "s" and must NOT be singularised.
const _NO_SINGULAR = new Set(["devops", "analysis", "physics", "mathematics", "os", "ios", "aws"]);

// Synonym map: many phrasings of the same specialization collapse to one track.
// Each `match` is a list of normalised substrings (lowercased, "&"/"and"/spaces
// stripped). Rules are tried TOP-DOWN and MORE-SPECIFIC FIRST, so e.g.
// "Embedded Linux" is caught before the generic "embedded" rule, and
// "Network Security" before the generic "network" rule.
const _TRACK_ALIASES = [
  { match: ["embeddedlinux"], canonical: "Embedded Linux" },
  { match: ["networksecurity", "cybersecurity"], canonical: "Network Security" },
  { match: ["digitaldesign", "digitalverification", "digitalic", "asicverification", "asicdesign", "rtldesign", "digitaldesignverification"], canonical: "Digital Design & Verification" },
  { match: ["embeddedsystem", "embeddedsw", "embeddedsoftware", "embedded"], canonical: "Embedded Systems" },
  { match: ["networkengineer", "networking", "ccna", "network"], canonical: "Network Engineer" },
  { match: ["devops"], canonical: "DevOps" },
  { match: ["artificialintelligence", "machinelearning", "deeplearning"], canonical: "AI" },
];

function _normForAlias(s) {
  return String(s).toLowerCase().replace(/&/g, "").replace(/\band\b/g, "").replace(/[^a-z0-9]/g, "");
}

function canonicalTrack(raw) {
  let t = String(raw).trim().replace(/\s+/g, " ");
  if (!t) return "";

  // 1) Synonym collapse — the strongest rule (handles the Digital Design family,
  //    ASIC Verification, etc. all mapping to one canonical track).
  const norm = _normForAlias(t);
  for (const rule of _TRACK_ALIASES) {
    if (rule.match.some((m) => norm === m || norm.includes(m))) return rule.canonical;
  }

  // 2) Otherwise: singularise trailing "s" + title-case (keeps unknown/custom tracks tidy).
  const words = t.split(" ");
  const last = words[words.length - 1];
  if (last.length > 3 && /[a-z]s$/i.test(last) && !/ss$/i.test(last) && !_NO_SINGULAR.has(last.toLowerCase())) {
    words[words.length - 1] = last.replace(/s$/i, "");
  }
  const ACR = new Set(["ai", "ic", "asic", "iot", "rf", "dsp", "os", "ui", "ux", "qa"]);
  return words
    .map((w) => {
      const lw = w.toLowerCase();
      if (lw === "devops") return "DevOps";
      if (ACR.has(lw) || w.length <= 3) return w.toUpperCase();
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(" ");
}

// How many placeholder tiles to shimmer while we wait for the data.
const HOME_TRACK_SKELETON_COUNT = 6;

// Count students per track (scalable, merges duplicates) and render on Home.
// Until the data loads we show a shimmer skeleton (no fake fixed tracks). The
// moment students arrive we render EVERY real track found in the data, in full,
// with the counts animating up — so the section reflects reality, not a guess.
function renderHomeTrackBreakdown() {
  const section = document.getElementById("homeTracksSection");
  const grid = document.getElementById("homeTrackGrid");
  if (!grid || !section) return;
  section.style.display = "";

  // ── No data yet → loading skeleton ──
  if (!STUDENTS || STUDENTS.length === 0) {
    if (!grid.classList.contains("is-loading")) {
      grid.classList.add("is-loading");
      grid.innerHTML = Array.from({ length: HOME_TRACK_SKELETON_COUNT })
        .map(() => `
          <div class="home-track-item home-track-skeleton" aria-hidden="true">
            <span class="home-track-count skeleton-box"></span>
            <span class="home-track-name skeleton-box"></span>
          </div>`).join("");
    }
    return;
  }

  // ── Data loaded → real, full track breakdown ──
  const counts = {};
  STUDENTS.forEach((s) => {
    let tracks = s.track;
    if (!tracks) return;
    if (!Array.isArray(tracks)) tracks = [tracks];
    const seen = new Set(); // de-dupe variants within one student
    tracks.forEach((t) => {
      const key = canonicalTrack(t);
      if (!key || seen.has(key)) return;
      seen.add(key);
      counts[key] = (counts[key] || 0) + 1;
    });
  });

  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (!entries.length) { section.style.display = "none"; return; }

  // Leaving the skeleton state (or the track set changed) → rebuild tiles.
  const wasLoading = grid.classList.contains("is-loading");
  grid.classList.remove("is-loading");
  const sameSet = !wasLoading && grid.childElementCount === entries.length &&
    entries.every(([t], i) => grid.children[i]?.dataset.track === t);

  if (!sameSet) {
    grid.innerHTML = entries.map(([track]) => `
      <div class="home-track-item" data-track="${track}">
        <span class="home-track-count">0</span>
        <span class="home-track-name">${track}</span>
      </div>`).join("");
  }
  entries.forEach(([track, n], i) => {
    const numEl = grid.children[i]?.querySelector(".home-track-count");
    if (numEl) animateCount(numEl, n);
  });
}

// Small count-up animation (reused by home stats).
function animateCount(el, target) {
  const duration = 1200;
  const start = performance.now();
  function tick(now) {
    const p = Math.min((now - start) / duration, 1);
    const eased = 1 - (1 - p) * (1 - p);
    el.textContent = Math.round(target * eased);
    if (p < 1) requestAnimationFrame(tick);
    else el.textContent = target;
  }
  requestAnimationFrame(tick);
}

// ===== Graduation Projects Data =====
// Loaded from data/projects.js

let currentProjectCat = "All";

// SVG icons per project category
const PROJ_ICONS = {
  Digital: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3"/></svg>`,
  Embedded: `<img src="icons/embedded_icon.png" alt="Embedded" class="proj-card-img-icon" />`,
  Network: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
};

// Display labels for category badges
const CAT_LABELS = {
  Digital: "Digital Design",
  Embedded: "Embedded Systems",
  Network: "Network",
};

function switchProjectCat(cat) {
  currentProjectCat = cat;

  // Update tab active state
  document
    .querySelectorAll(".project-tab")
    .forEach((btn) => btn.classList.remove("active"));
  const activeBtn = document.querySelector(`[data-pcat="${cat}"]`);
  if (activeBtn) activeBtn.classList.add("active");

  renderProjects();
}

function renderProjects() {
  const grid = document.getElementById("projectsGrid");
  if (!grid) return;

  // "All" shows every project; otherwise filter to the chosen category.
  // Sort alphabetically by leader name.
  const filtered = GRADUATION_PROJECTS
    .filter((p) => currentProjectCat === "All" || p.category === currentProjectCat)
    .sort((a, b) => {
      const aLeader = (a.team || []).find(m => m.leader);
      const bLeader = (b.team || []).find(m => m.leader);
      const aName = aLeader ? aLeader.name : "";
      const bName = bLeader ? bLeader.name : "";
      return aName.localeCompare(bName);
    });

  if (filtered.length === 0) {
    grid.innerHTML =
      '<p class="no-projects">No projects found in this category.</p>';
    return;
  }

  grid.innerHTML = "";

  filtered.forEach((project, idx) => {
    // Per-project key so "All" view colours each card by its own category.
    const catKey = (project.category || "").toLowerCase();
    const card = document.createElement("div");
    card.className = `project-card cat-${catKey}`;
    card.style.animationDelay = `${idx * 0.1}s`;

    // ── Card Top: badge + icon ──
    const cardTop = document.createElement("div");
    cardTop.className = "project-card-top";
    const iconSvg = PROJ_ICONS[project.category] || "";
    const catLabel = CAT_LABELS[project.category] || project.category;
    cardTop.innerHTML = `
            <span class="project-cat-badge cat-${catKey}">${iconSvg} ${catLabel}</span>
            <div class="project-card-icon cat-${catKey}">${iconSvg}</div>
        `;

    // ── Coming Soon Body ──
    const comingSoonEl = document.createElement("div");
    comingSoonEl.className = "project-coming-soon";
    comingSoonEl.innerHTML = `
            <div class="cs-pulse-ring"></div>
            <span class="cs-clock">🕐</span>
            <span class="cs-text">Coming Soon</span>
            <div class="project-discussion-countdown" aria-label="Project Discussion countdown">
                <span class="project-discussion-countdown-title">Project Discussion</span>
                <div class="project-discussion-countdown-grid">
                    <span><strong data-project-countdown-unit="days">00</strong><small>Days</small></span>
                    <span><strong data-project-countdown-unit="hours">00</strong><small>Hours</small></span>
                    <span><strong data-project-countdown-unit="minutes">00</strong><small>Min</small></span>
                    <span><strong data-project-countdown-unit="seconds">00</strong><small>Sec</small></span>
                </div>
            </div>
            <span class="cs-sub">Details will be announced shortly</span>
        `;

    // ── Team Section ──
    const teamSection = document.createElement("div");
    teamSection.className = "project-team";

    const teamLabel = document.createElement("span");
    teamLabel.className = "project-team-label";
    teamLabel.textContent = "Team";

    const membersRow = document.createElement("div");
    membersRow.className = "project-members";

    // Sort team: leader first, then rest alphabetically
    const sortedTeam = [...(project.team || [])].sort((a, b) => {
      if (a.leader && !b.leader) return -1;
      if (!a.leader && b.leader) return 1;
      return a.name.localeCompare(b.name);
    });

    sortedTeam.forEach((member) => {
      const student = STUDENTS.find((s) => s.name === member.name);

      const pill = document.createElement("button");
      pill.className =
        "project-member-pill" + (member.leader ? " is-leader" : "");
      pill.title = member.leader ? `${member.name} — Team Leader` : member.name;
      pill.type = "button";

      // Crown for leader — star SVG
      if (member.leader) {
        const leaderIcon = document.createElement("span");
        leaderIcon.className = "leader-icon";
        leaderIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;
        pill.appendChild(leaderIcon);
      }

      // Avatar — show initials first, swap to photo lazily when card enters viewport
      if (student && student.photo) {
        const fb = document.createElement("span");
        fb.className = "member-avatar-sm-initials";
        fb.style.background = student.color;
        fb.textContent = getInitials(member.name);
        pill.appendChild(fb);

        const img = document.createElement("img");
        img.alt = member.name;
        img.className = "member-avatar-sm";
        img.style.display = "none";
        pill.appendChild(img);

        let retryCount = 0;
        let cancelled = false;
        const MAX_RETRIES = 3;
        const RETRY_DELAYS = [2000, 4000, 8000];
        const unwatch = _watchCardRemoval(pill, "projectsGrid", () => { cancelled = true; });

        function tryLoadMember() {
          if (cancelled) return;
          let url = student.photo;
          if (retryCount === 1) url = url.replace(/\.jpg$/i, '.jpeg');
          else if (retryCount === 2) url = url.replace(/\.jpg$/i, '.webp');
          else if (retryCount > 2) {
            const sep = url.includes("?") ? "&" : "?";
            url = url.replace(/\.jpg$/i, '.webp') + sep + "_r=" + retryCount;
          }
          img.onload = () => {
            if (cancelled) return;
            img.style.display = "";
            if (pill.contains(fb)) pill.replaceChild(img, fb);
            unwatch();
          };
          img.onerror = () => {
            if (cancelled) return;
            if (retryCount < MAX_RETRIES) {
              setTimeout(() => { retryCount++; tryLoadMember(); }, RETRY_DELAYS[retryCount] || 8000);
            }
          };
          img.src = url;
        }

        // ── Lazy load: start only when the project card enters the viewport ──
        const io = new IntersectionObserver((entries, obs) => {
          if (entries[0].isIntersecting) {
            obs.disconnect();
            tryLoadMember();
          }
        }, { rootMargin: "200px" });
        // Observe the parent project-card (pill may not be in DOM yet)
        const parentCard = pill.closest(".project-card") || pill;
        io.observe(parentCard);
      } else {
        const av = document.createElement("span");
        av.className = "member-avatar-sm-initials";
        av.style.background = student
          ? student.color
          : "linear-gradient(135deg,#8b5cf6,#ec4899)";
        av.textContent = getInitials(member.name);
        pill.appendChild(av);
      }

      const nameSpan = document.createElement("span");
      nameSpan.textContent = member.name.split(" ").slice(0, 2).join(" ");
      pill.appendChild(nameSpan);

      // Click → open student modal (pass teamLeader flag for leaders)
      if (student) {
        pill.style.cursor = "pointer";
        const studentData = member.leader
          ? { ...student, teamLeader: true }
          : student;
        pill.addEventListener("click", () => openPhotoModal(studentData));
      } else {
        pill.style.cursor = "default";
        pill.style.opacity = "0.7";
      }

      membersRow.appendChild(pill);
    });

    teamSection.appendChild(teamLabel);
    teamSection.appendChild(membersRow);

    card.appendChild(cardTop);
    card.appendChild(comingSoonEl);
    card.appendChild(teamSection);

    grid.appendChild(card);
  });

  updateProjectDiscussionCountdowns();
}

function updateProjectDiscussionCountdowns() {
  const countdownBlocks = document.querySelectorAll(
    ".project-discussion-countdown",
  );
  if (!countdownBlocks.length) return;

  const discussionDate = EVENTS.discussion.date;
  const diff = discussionDate - new Date();

  if (diff <= 0) {
    countdownBlocks.forEach((block) => {
      block.innerHTML =
        '<span class="project-discussion-countdown-title">Project Discussion is here</span>';
    });
    if (projectDiscussionCountdownInterval) {
      clearInterval(projectDiscussionCountdownInterval);
      projectDiscussionCountdownInterval = null;
    }
    return;
  }

  const parts = {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
    minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
    seconds: Math.floor((diff % (1000 * 60)) / 1000),
  };

  countdownBlocks.forEach((block) => {
    Object.entries(parts).forEach(([unit, value]) => {
      const el = block.querySelector(`[data-project-countdown-unit="${unit}"]`);
      if (el) el.textContent = String(value).padStart(2, "0");
    });
  });
}

function startProjectDiscussionCountdown() {
  updateProjectDiscussionCountdowns();

  if (projectDiscussionCountdownInterval) return;
  projectDiscussionCountdownInterval = setInterval(
    updateProjectDiscussionCountdowns,
    1000,
  );
}

let currentTab = "exam";
let currentMode = "countdown";
let countdownInterval = null;
let projectDiscussionCountdownInterval = null;
let previousValues = { days: "", hours: "", minutes: "", seconds: "" };
// Celebration window: show overlay only within 10 min of event ending
const CELEBRATION_WINDOW_MS = 10 * 60 * 1000;
// In-memory flag: prevents overlay showing twice in the same session
let celebrationShown = {};
let countUpMode = {};

// ===== Shared DOM Removal Watcher =====
// One MutationObserver per grid (not one per card) to avoid hundreds of observers.
// gridId: "studentsGrid" or "projectsGrid" — looked up lazily so it works before
//         the card is added to the DOM.
// Usage: const unwatch = _watchCardRemoval(el, "studentsGrid", onRemoved)
const _cardWatchers = new Map(); // gridId → { obs, callbacks: Map<el, fn> }
function _watchCardRemoval(el, gridId, onRemoved) {
  if (!_cardWatchers.has(gridId)) {
    const callbacks = new Map();
    const obs = new MutationObserver(() => {
      const gridEl = document.getElementById(gridId);
      callbacks.forEach((cb, watchedEl) => {
        if (!gridEl || !gridEl.contains(watchedEl)) {
          cb();
          callbacks.delete(watchedEl);
        }
      });
      // Self-cleanup when no more watchers
      if (callbacks.size === 0) {
        obs.disconnect();
        _cardWatchers.delete(gridId);
      }
    });
    // Observe the grid when available, otherwise observe body as fallback
    const target = document.getElementById(gridId) || document.body;
    obs.observe(target, { childList: true, subtree: true });
    _cardWatchers.set(gridId, { obs, callbacks });
  }

  const { callbacks } = _cardWatchers.get(gridId);
  callbacks.set(el, onRemoved);

  // Return an unwatch function so the caller can clean up on success
  return function unwatch() {
    callbacks.delete(el);
    const entry = _cardWatchers.get(gridId);
    if (entry && entry.callbacks.size === 0) {
      entry.obs.disconnect();
      _cardWatchers.delete(gridId);
    }
  };
}

// ===== Swipe Gesture (Mode Switching) =====
const MODES = ["home", "countdown", "yearbook", "projects"];

function initSwipeGesture() {
  let touchStartX = 0;
  let touchStartY = 0;
  let isSwiping = false;
  let swipeBlockedByScroll = false; // true when touch started inside a scrollable element

  document.addEventListener(
    "touchstart",
    (e) => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      isSwiping = true;

      // Block mode-switch if the gesture starts inside a horizontally scrollable element
      // (e.g. project-tabs track bar) so the user can scroll it freely.
      const scrollableParent = e.target.closest(".project-tabs, [data-no-swipe]");
      swipeBlockedByScroll = !!scrollableParent;
    },
    { passive: true },
  );

  document.addEventListener(
    "touchend",
    (e) => {
      if (!isSwiping) return;
      isSwiping = false;

      // Don't switch modes if swipe started on a scrollable sub-element
      if (swipeBlockedByScroll) return;

      const deltaX = e.changedTouches[0].clientX - touchStartX;
      const deltaY = e.changedTouches[0].clientY - touchStartY;

      // Only handle if horizontal movement is dominant and > 60px threshold
      if (Math.abs(deltaX) < 60 || Math.abs(deltaX) < Math.abs(deltaY)) return;

      const currentIdx = MODES.indexOf(currentMode);
      if (deltaX < 0) {
        // Swipe LEFT → next mode
        const nextIdx = (currentIdx + 1) % MODES.length;
        switchMode(MODES[nextIdx]);
      } else {
        // Swipe RIGHT → previous mode
        const prevIdx = (currentIdx - 1 + MODES.length) % MODES.length;
        switchMode(MODES[prevIdx]);
      }
    },
    { passive: true },
  );
}


// ===== Keyboard Navigation (desktop — mirrors the mobile swipe) =====
// ← / → cycle through modes, and 1 / 2 / 3 jump straight to a mode.
function initKeyboardNav() {
  document.addEventListener("keydown", (e) => {
    // Never hijack typing or shortcut combos
    const tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || e.target.isContentEditable) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    // Don't switch modes while the photo modal is open (Esc closes it)
    const modal = document.getElementById("photoModal");
    if (modal && modal.style.display === "flex") return;

    // On a portal page (Submit / Approvals) the nav keys are disabled so they
    // don't yank the user out mid-form; Esc takes them back home instead.
    if (PORTAL_MODES.includes(currentMode)) {
      if (e.key === "Escape") switchMode("countdown");
      return;
    }

    const idx = MODES.indexOf(currentMode);
    switch (e.key) {
      case "ArrowRight":
        switchMode(MODES[(idx + 1) % MODES.length]);
        break;
      case "ArrowLeft":
        switchMode(MODES[(idx - 1 + MODES.length) % MODES.length]);
        break;
      case "1":
        switchMode("countdown");
        break;
      case "2":
        switchMode("yearbook");
        break;
      case "3":
        switchMode("projects");
        break;
      default:
        return;
    }
  });
}

// ===== Initialize =====
document.addEventListener("DOMContentLoaded", async () => {
  window.scrollTo(0, 0);
  startCountdown();
  startProjectDiscussionCountdown();
  updateLocalTime();
  initAudio();
  initSwipeGesture(); // Init immediately — no need to wait for Firebase
  initKeyboardNav();
  initNavMenu();
  initYearbookFilters();
  initContactForm();
  initFullProfile();

  // Render local fallback data right away so the UI is usable from the start
  await loadDrivePhotos();
  buildYearbookFilters();
  applyFilters();
  renderStats();

  // If we have a cached Firebase payload from a previous online visit, replay
  // it immediately. This makes the full yearbook/projects appear instantly on
  // offline loads instead of waiting for ~30s of network retries to time out.
  const _cachedDb = readOfflineCache();
  if (_cachedDb) applyDbPayload(_cachedDb);

  // Browser Back/Forward (and backspace) navigate between views in-page.
  window.addEventListener("popstate", (e) => {
    const mode = (e.state && e.state.mode) || "home";
    // The full-profile overlay sits on top of a section. If we're leaving it
    // (hash no longer #profile), tear it down first so the section underneath
    // shows through — without refetching the yearbook.
    if (mode !== "profile-view" && typeof closeFullProfile === "function") {
      closeFullProfile();
    }
    // "profile-view" isn't a real section; the overlay is shown by openFullProfile.
    // Restore the section that was under it instead so Back/Forward stays sane.
    if (mode === "profile-view") return;

    // Closing an overlay (quick card / full profile) → we have a saved scroll
    // position to restore so the user lands back on the same card. switchMode
    // re-renders the grid and forces scroll to the top, so re-apply our saved
    // position right after (and after layout settles).
    const restoreScroll = _overlayReturnScroll;
    switchMode(mode, true); // replay without pushing a new entry
    if (restoreScroll != null) {
      window.scrollTo(0, restoreScroll);
      requestAnimationFrame(() => window.scrollTo(0, restoreScroll));
      _overlayReturnScroll = null;
    }
  });

  // Land on the right view for the current URL (seed the first history entry).
  // /student is a transient quick-card overlay that needs a student object we
  // don't have on a cold load, so it falls back to the yearbook. /profile is
  // restored: we remembered which student was open (sessionStorage), so we land
  // on the section it sat on and reopen the same profile once data is ready.
  const firstSeg = (location.pathname || "/").replace(/^\/+|\/+$/g, "");
  const OVERLAY_PATHS = ["profile", "profile-view", "student"];

  let savedProfile = null;
  if (firstSeg === "profile" || firstSeg === "profile-view") {
    try { savedProfile = JSON.parse(sessionStorage.getItem("eece-open-profile") || "null"); } catch (_) {}
  }

  let startMode;
  if (savedProfile && savedProfile.student) {
    // The section the profile sat on (yearbook/projects/home) is the base view.
    startMode = VALID_MODES.includes(savedProfile.from) ? savedProfile.from : "yearbook";
  } else if (OVERLAY_PATHS.includes(firstSeg)) {
    startMode = "yearbook";
  } else {
    startMode = pathToMode();
  }
  history.replaceState({ mode: startMode }, "", modeToPath(startMode));
  switchMode(startMode, true);

  // If a profile was open before the refresh, reopen it. Try now (data may
  // already be in the offline cache); if the student isn't loaded yet, stash
  // the key so fetchFirebaseData reopens it the moment fresh data arrives.
  if (savedProfile && savedProfile.student) {
    const reopen = () => {
      const s = findStudentByKey(savedProfile.student);
      if (s && typeof openFullProfile === "function") {
        // Push a fresh /profile entry on top of the base section so Back works.
        openFullProfile(s);
        _pendingProfileKey = null;
        return true;
      }
      return false;
    };
    if (!reopen()) _pendingProfileKey = savedProfile.student;
  }

  // Fetch fresh data from Firebase in the background — no blocking await.
  // On success it calls loadDrivePhotos + renderStats + re-renders active view.
  // On failure it retries automatically with exponential backoff.
  // NOTE: prefetchStudentPhotos() is NOT called here — it runs on-demand
  //       when the user opens the Yearbook tab, to avoid competing with the
  //       page's critical resources (logo, CSS, Firebase) on initial load.
  fetchFirebaseData();
});

// ===== Mobile nav drawer (hamburger) =====
function openNavMenu() {
  document.body.classList.add("nav-open");
  const t = document.getElementById("navToggle");
  if (t) t.setAttribute("aria-expanded", "true");
}
function closeNavMenu() {
  document.body.classList.remove("nav-open");
  const t = document.getElementById("navToggle");
  if (t) t.setAttribute("aria-expanded", "false");
}
function toggleNavMenu() {
  document.body.classList.contains("nav-open") ? closeNavMenu() : openNavMenu();
}
function initNavMenu() {
  const toggle = document.getElementById("navToggle");
  if (toggle) {
    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleNavMenu();
    });
  }
  // Click outside the navbar or press Esc closes the drawer.
  document.addEventListener("click", (e) => {
    if (!document.body.classList.contains("nav-open")) return;
    if (!e.target.closest(".navbar")) closeNavMenu();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeNavMenu();
  });
}

// ===== Mode Switching (Top-Level) =====
// Submit/Admin are "portal" pages — they take over the whole screen (no header
// nav links) for a focused, page-like feel. They're reached from the navbar
// "Join Us" button / account dropdown, not from the section links.
const PORTAL_MODES = ["submit", "admin"];

// ── Clean-URL routing ──
// Every view maps to a real path (e.g. "/yearbook"), so links are shareable
// and refreshing lands on the same view. The server rewrites unknown paths
// back to index.html (see vercel.json), and we resolve the path → mode here.
// Home is the root "/", never "/home", so the canonical URL stays clean.
const VALID_MODES = ["home", "countdown", "yearbook", "projects", "submit", "admin"];

function modeToPath(mode) {
  return mode === "home" ? "/" : `/${mode}`;
}

// Resolve the current location (or a given path) to a real mode, falling back
// to "home" for the root and anything unrecognised.
function pathToMode(pathname = location.pathname) {
  const seg = (pathname || "/").replace(/^\/+|\/+$/g, "");
  if (!seg) return "home";
  return VALID_MODES.includes(seg) ? seg : "home";
}

function switchMode(mode, fromHistory = false) {
  const prevMode = currentMode;
  currentMode = mode;
  // Expose active mode so the portal module can react (e.g. refresh approvals).
  document.body.dataset.mode = mode;

  // Push a history entry so the browser Back button / backspace returns to the
  // previous view instead of leaving the site. popstate replays without pushing.
  // Clean path-based URLs (e.g. /yearbook); Home lives at the root "/".
  if (!fromHistory && prevMode !== mode) {
    try { history.pushState({ mode }, "", modeToPath(mode)); } catch (_) {}
  }

  // Always close the mobile nav drawer when navigating.
  closeNavMenu();

  // Portal pages take over the screen: hide the top nav + header chrome.
  const isPortal = PORTAL_MODES.includes(mode);
  document.body.classList.toggle("portal-active", isPortal);

  // Highlight the active section link (only the 3 section modes have a link).
  document
    .querySelectorAll(".nav-link")
    .forEach((btn) => btn.classList.remove("active"));
  const activeBtn = document.querySelector(`.nav-link[data-mode="${mode}"]`);
  if (activeBtn) activeBtn.classList.add("active");

  // Show/hide sections (submit & admin are added by portal.js feature)
  const sections = {
    home: document.getElementById("mode-home"),
    countdown: document.getElementById("mode-countdown"),
    yearbook: document.getElementById("mode-yearbook"),
    projects: document.getElementById("mode-projects"),
    submit: document.getElementById("mode-submit"),
    admin: document.getElementById("mode-admin"),
  };
  Object.values(sections).forEach((el) => {
    if (el) el.style.display = "none";
  });

  if (mode === "countdown") {
    document.body.classList.add("mode-countdown-active");
    window.scrollTo(0, 0);
    sections.countdown.style.display = "flex";
  } else {
    document.body.classList.remove("mode-countdown-active");
    window.scrollTo(0, 0);
    if (mode === "home" && sections.home) {
      sections.home.style.display = "block";
      renderHomeStats();
    } else if (mode === "yearbook") {
      sections.yearbook.style.display = "block";
      // Fresh entry from another section (nav link / swipe) → start clean.
      // A history replay (Back/Forward, e.g. returning from a profile) keeps
      // the previous search + filters so the user lands where they left off.
      // Either way we only re-render from the in-memory cache — never refetch.
      if (!fromHistory && prevMode !== "yearbook") {
        document.getElementById("yearbookSearch").value = "";
        currentSearchQuery = "";
        selectedCategories.clear();
      }
      // Returning via Back/Forward (from a card or profile) → no entrance
      // animation. Fresh entry from another section → animate the grid in.
      applyFilters(!fromHistory);
      renderStats();
    } else if (mode === "projects") {
      sections.projects.style.display = "block";
      renderProjects();
    } else if (mode === "submit" && sections.submit) {
      sections.submit.style.display = "block";
    } else if (mode === "admin" && sections.admin) {
      sections.admin.style.display = "block";
    }
  }
}

// ===== Tab Switching =====
function switchTab(tab) {
  currentTab = tab;

  // Update active tab styling
  document
    .querySelectorAll(".tab")
    .forEach((t) => t.classList.remove("active"));
  document.querySelector(`[data-tab="${tab}"]`).classList.add("active");

  // Reset previous values to force update
  previousValues = { days: "", hours: "", minutes: "", seconds: "" };

  startCountdown();
}

// ===== Start Countdown =====
function startCountdown() {
  if (countdownInterval) clearInterval(countdownInterval);

  updateCountdown();
  countdownInterval = setInterval(updateCountdown, 1000);
}

// ===== Celebration overlay =====
function showCelebrationOverlay(tab) {
  if (celebrationShown[tab]) return;
  celebrationShown[tab] = true;

  const messages = {
    exam: {
      icon: "🎓",
      badge: "DONE!",
      title: "Congratulations!",
      en: "The Final Exam is officially OVER.",
      ar: "كفاره يجدعاااااااان 🙌",
      tag: "Class of 2026",
    },
    discussion: {
      icon: "🏆",
      badge: "DONE!",
      title: "Congratulations!",
      en: "Project Discussion is officially complete.",
      ar: "خلصت المناقشة! ماشاء الله 🌟",
      tag: "Class of 2026",
    },
    party: {
      icon: "🥳",
      badge: "GRADUATED!",
      title: "Happy Graduation!",
      en: "This is YOUR day. You earned every second of it.",
      ar: "مبروك التخرج! ربنا يكمل بالخير 🎉",
      tag: "Class of 2026",
    },
  };

  const msg = messages[tab] || messages.exam;
  const AUTO_DISMISS_MS = 7000;

  const overlay = document.createElement("div");
  overlay.id = "celebrationOverlay";

  overlay.innerHTML = `
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&display=swap');

      #celebrationOverlay {
        position: fixed; inset: 0; z-index: 9999;
        display: flex; align-items: center; justify-content: center;
        padding: 1.5rem;
        font-family: 'Inter', sans-serif;
        overflow: hidden;
        animation: co-bgIn 0.5s cubic-bezier(0.22,1,0.36,1) both;
      }

      /* Animated mesh background */
      #co-bg {
        position: absolute; inset: 0;
        background:
          radial-gradient(ellipse 80% 60% at 20% 30%, rgba(139,92,246,0.55) 0%, transparent 65%),
          radial-gradient(ellipse 60% 50% at 80% 70%, rgba(236,72,153,0.45) 0%, transparent 60%),
          radial-gradient(ellipse 50% 40% at 50% 10%, rgba(251,191,36,0.25) 0%, transparent 55%),
          #0d0020;
        animation: co-bgPulse 4s ease-in-out infinite alternate;
      }
      @keyframes co-bgPulse {
        from { filter: brightness(1); }
        to   { filter: brightness(1.12); }
      }

      /* Floating rings */
      .co-ring {
        position: absolute; border-radius: 50%;
        border: 1.5px solid rgba(255,255,255,0.07);
        animation: co-ringGrow linear infinite;
        pointer-events: none;
      }
      @keyframes co-ringGrow {
        from { transform: scale(0.3); opacity: 0.6; }
        to   { transform: scale(2.5); opacity: 0; }
      }

      /* Glass card */
      #co-card {
        position: relative; z-index: 2;
        max-width: 520px; width: 100%;
        background: rgba(255,255,255,0.06);
        backdrop-filter: blur(24px) saturate(180%);
        -webkit-backdrop-filter: blur(24px) saturate(180%);
        border: 1px solid rgba(255,255,255,0.14);
        border-radius: 28px;
        padding: clamp(2rem,5vw,3rem) clamp(1.5rem,5vw,2.5rem);
        box-shadow:
          0 0 0 1px rgba(139,92,246,0.2),
          0 30px 80px rgba(0,0,0,0.6),
          inset 0 1px 0 rgba(255,255,255,0.15);
        animation: co-cardIn 0.7s cubic-bezier(0.22,1,0.36,1) 0.15s both;
        text-align: center;
      }
      @keyframes co-bgIn    { from{opacity:0;} to{opacity:1;} }
      @keyframes co-cardIn  { from{opacity:0;transform:translateY(40px) scale(0.94);} to{opacity:1;transform:none;} }

      /* Badge */
      #co-badge {
        display: inline-block;
        background: linear-gradient(135deg,#fbbf24,#f59e0b);
        color: #1a0a00; font-weight: 800; font-size: 0.72rem;
        letter-spacing: 0.14em; text-transform: uppercase;
        padding: 0.3rem 1rem; border-radius: 50px;
        margin-bottom: 1.4rem;
        animation: co-fadeUp 0.5s ease 0.4s both;
        box-shadow: 0 0 20px rgba(251,191,36,0.4);
      }

      /* Icon */
      #co-icon {
        font-size: clamp(3.5rem,10vw,5.5rem);
        display: block; margin-bottom: 0.6rem;
        animation: co-iconBounce 2.4s ease-in-out 0.5s infinite;
        filter: drop-shadow(0 0 18px rgba(251,191,36,0.5));
        line-height: 1;
      }
      @keyframes co-iconBounce {
        0%,100%{transform:translateY(0) scale(1);}
        40%{transform:translateY(-14px) scale(1.08);}
        60%{transform:translateY(-6px) scale(1.04);}
      }

      /* Title */
      #co-title {
        font-size: clamp(1.8rem,6vw,3.2rem); font-weight: 900;
        line-height: 1.2; margin-bottom: 0.6rem;
        padding: 0 0.2em 0.05em; /* prevents gradient-clip cutting last char */
        background: linear-gradient(135deg,#fff 20%,#c4b5fd 60%,#f9a8d4 100%);
        -webkit-background-clip: text; -webkit-text-fill-color: transparent;
        background-clip: text;
        animation: co-fadeUp 0.5s ease 0.55s both;
      }

      /* Divider */
      #co-divider {
        width: 60px; height: 3px; margin: 0.8rem auto 1.1rem;
        border-radius: 2px;
        background: linear-gradient(90deg,#8b5cf6,#ec4899,#fbbf24);
        animation: co-fadeUp 0.5s ease 0.65s both;
      }

      /* Subtitle EN */
      #co-en {
        font-size: clamp(0.95rem,3vw,1.2rem); font-weight: 400;
        color: rgba(255,255,255,0.85); margin-bottom: 0.5rem;
        animation: co-fadeUp 0.5s ease 0.75s both;
      }

      /* Subtitle AR */
      #co-ar {
        font-size: clamp(0.9rem,2.8vw,1.1rem); font-weight: 500;
        color: #c4b5fd; margin-bottom: 1.8rem;
        direction: rtl;
        animation: co-fadeUp 0.5s ease 0.85s both;
      }

      /* Progress bar */
      #co-progress-wrap {
        width: 100%; height: 3px;
        background: rgba(255,255,255,0.1);
        border-radius: 2px; overflow: hidden;
        animation: co-fadeUp 0.4s ease 1s both;
      }
      #co-progress-bar {
        height: 100%; width: 100%;
        background: linear-gradient(90deg,#8b5cf6,#ec4899,#fbbf24);
        border-radius: 2px;
        transform-origin: left;
        animation: co-shrink ${AUTO_DISMISS_MS}ms linear 1.1s both;
      }
      @keyframes co-shrink { from{transform:scaleX(1);} to{transform:scaleX(0);} }


      /* Sparkle dots */
      .co-spark {
        position: absolute; border-radius: 50%;
        pointer-events: none;
        animation: co-sparkAnim ease-in-out infinite;
      }
      @keyframes co-sparkAnim {
        0%,100%{opacity:0.15;transform:scale(0.7);}
        50%{opacity:0.9;transform:scale(1.2);}
      }

      @keyframes co-fadeUp {
        from{opacity:0;transform:translateY(16px);}
        to{opacity:1;transform:none;}
      }
    </style>

    <div id="co-bg"></div>

    <!-- Floating rings -->
    <div class="co-ring" style="width:300px;height:300px;top:50%;left:50%;margin:-150px 0 0 -150px;animation-duration:5s;animation-delay:0s;"></div>
    <div class="co-ring" style="width:500px;height:500px;top:50%;left:50%;margin:-250px 0 0 -250px;animation-duration:7s;animation-delay:1.5s;"></div>
    <div class="co-ring" style="width:700px;height:700px;top:50%;left:50%;margin:-350px 0 0 -350px;animation-duration:9s;animation-delay:0.8s;"></div>

    <!-- Sparkle dots -->
    <div class="co-spark" style="width:8px;height:8px;background:#fbbf24;top:18%;left:15%;animation-duration:2.1s;animation-delay:0.3s;"></div>
    <div class="co-spark" style="width:5px;height:5px;background:#ec4899;top:22%;right:18%;animation-duration:1.8s;animation-delay:0.8s;"></div>
    <div class="co-spark" style="width:10px;height:10px;background:#8b5cf6;bottom:20%;left:20%;animation-duration:2.5s;animation-delay:0.1s;"></div>
    <div class="co-spark" style="width:6px;height:6px;background:#34d399;bottom:25%;right:15%;animation-duration:2.2s;animation-delay:1s;"></div>
    <div class="co-spark" style="width:4px;height:4px;background:#fff;top:35%;right:10%;animation-duration:1.6s;animation-delay:0.4s;"></div>
    <div class="co-spark" style="width:7px;height:7px;background:#f9a8d4;top:60%;left:8%;animation-duration:2.8s;animation-delay:0.6s;"></div>

    <!-- Card -->
    <div id="co-card">
      <div id="co-badge">${msg.tag}</div>
      <span id="co-icon">${msg.icon}</span>
      <div id="co-title">${msg.title}</div>
      <div id="co-divider"></div>
      <div id="co-en">${msg.en}</div>
      <div id="co-progress-wrap">
        <div id="co-progress-bar"></div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Confetti bursts
  launchConfetti();
  setTimeout(launchConfetti, 900);
  setTimeout(launchConfetti, 1800);

  // Auto-dismiss
  setTimeout(dismissCelebration, AUTO_DISMISS_MS + 1100);
}

function dismissCelebration() {
  const overlay = document.getElementById("celebrationOverlay");
  if (!overlay) return;

  overlay.style.transition = "opacity 0.6s ease, transform 0.6s ease";
  overlay.style.opacity = "0";
  overlay.style.transform = "scale(1.04)";

  // Switch to count-up for current tab
  countUpMode[currentTab] = true;

  startCountdown();

  setTimeout(() => {
    overlay.remove();
    window.scrollTo({ top: 0, behavior: "instant" });
  }, 650);
}

// ===== Update Countdown =====
function updateCountdown() {
  updateProjectDiscussionCountdowns();

  const event = EVENTS[currentTab];
  const targetDate = event.date;

  // Update event label
  const eventLabel = document.getElementById("eventLabel");
  const targetDisplay = document.getElementById("targetDateDisplay");

  if (!targetDate) {
    eventLabel.textContent = "Select a date and time above";
    targetDisplay.textContent = "";
    document.getElementById("days").textContent = "00";
    document.getElementById("hours").textContent = "00";
    document.getElementById("minutes").textContent = "00";
    document.getElementById("seconds").textContent = "00";
    return;
  }

  // Format display date
  const options = {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  };
  const formattedDate = targetDate.toLocaleString("en-GB", options);

  const now = new Date();
  const diff = targetDate - now;

  if (diff <= 0) {
    // ── Event has passed ──
    const elapsed = Math.abs(diff); // ms since event ended

    if (!celebrationShown[currentTab] && elapsed <= CELEBRATION_WINDOW_MS) {
      // Within the 10-minute celebration window → show overlay
      showCelebrationOverlay(currentTab);
      // Pause interval — will restart on overlay dismissal
      clearInterval(countdownInterval);
      countdownInterval = null;
      return;
    }

    // ── COUNT-UP mode ──
    // (elapsed already computed above)
    const days = Math.floor(elapsed / (1000 * 60 * 60 * 24));
    const hours = Math.floor(
      (elapsed % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60),
    );
    const minutes = Math.floor((elapsed % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((elapsed % (1000 * 60)) / 1000);

    const daysStr = String(days).padStart(2, "0");
    const hoursStr = String(hours).padStart(2, "0");
    const minutesStr = String(minutes).padStart(2, "0");
    const secondsStr = String(seconds).padStart(2, "0");

    const skip = _countdownFirstRender;
    animateNumber("days", daysStr, previousValues.days, skip);
    animateNumber("hours", hoursStr, previousValues.hours, skip);
    animateNumber("minutes", minutesStr, previousValues.minutes, skip);
    animateNumber("seconds", secondsStr, previousValues.seconds, skip);
    _countdownFirstRender = false;

    previousValues = {
      days: daysStr,
      hours: hoursStr,
      minutes: minutesStr,
      seconds: secondsStr,
    };

    // Label changes to count-up
    const countUpLabels = {
      exam: "Time since Final Exam ended",
      discussion: "Time since Project Discussion",
      party: "Time since Graduation Party",
    };
    eventLabel.innerHTML = `🎉 ${countUpLabels[currentTab] || "Time since event"}: <span>${formattedDate}</span>`;

    updateLocalTime();
    return;
  }

  // ── Normal countdown ──
  eventLabel.innerHTML = `${event.label}: <span>${formattedDate}</span>`;

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  const daysStr = String(days).padStart(2, "0");
  const hoursStr = String(hours).padStart(2, "0");
  const minutesStr = String(minutes).padStart(2, "0");
  const secondsStr = String(seconds).padStart(2, "0");

  // Animate number changes (skip animation on very first render to avoid 00→real flash)
  const skip = _countdownFirstRender;
  animateNumber("days", daysStr, previousValues.days, skip);
  animateNumber("hours", hoursStr, previousValues.hours, skip);
  animateNumber("minutes", minutesStr, previousValues.minutes, skip);
  animateNumber("seconds", secondsStr, previousValues.seconds, skip);
  _countdownFirstRender = false;

  previousValues = {
    days: daysStr,
    hours: hoursStr,
    minutes: minutesStr,
    seconds: secondsStr,
  };

  updateLocalTime();
}

// ===== Animate Number =====
let _countdownFirstRender = true; // skip flip animation on very first tick

function animateNumber(id, newValue, oldValue, skipAnimation = false) {
  const el = document.getElementById(id);
  if (!el) return;
  if (skipAnimation) {
    // Write immediately with no animation — used on first render
    el.textContent = newValue;
    return;
  }
  if (newValue !== oldValue) {
    el.textContent = newValue;
    el.classList.remove("number-changed");
    void el.offsetWidth; // trigger reflow
    el.classList.add("number-changed");
  }
}

// ===== Update Local Time =====
function updateLocalTime() {
  const now = new Date();
  const options = {
    month: "numeric",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  };
  document.getElementById("localTime").textContent =
    "Local time: " + now.toLocaleString("en-GB", options);
}

// ===== Audio Playlist =====
const audioFiles = [
  "audio/Beehive_Events_لحلمي_أبحرت_سفني_فعادت_تحمل_الخير_🛳️_مقطع_من_البرومو.m4a",
  "audio/Facebook 1470750324447269(m4a).m4a",
  "audio/Facebook 1567613794189465(m4a).m4a",
  "audio/عبدالفتاح_سلامه_واليوم_نلاقي_امالا_؛قد_صالت_في_النفس_وجالت_قد_صرت.m4a",
];

let shuffledPlaylist = [];
let currentTrackIndex = 0;
let audioStarted = false;

// Shuffle array (Fisher-Yates)
function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function initAudio() {
  const audio = document.getElementById("bgAudio");
  shuffledPlaylist = shuffleArray(audioFiles);
  currentTrackIndex = 0;

  // When a track ends, play the next one
  audio.addEventListener("ended", () => {
    currentTrackIndex++;
    if (currentTrackIndex >= shuffledPlaylist.length) {
      shuffledPlaylist = shuffleArray(audioFiles);
      currentTrackIndex = 0;
    }
    audio.src = shuffledPlaylist[currentTrackIndex];
    audio.play().catch(() => {});
  });

  // Pre-load first track (don't auto-play, wait for user click)
  audio.src = shuffledPlaylist[currentTrackIndex];
}

function hideHint() {
  const hint = document.getElementById("audioHint");
  if (hint) {
    hint.classList.add("hidden");
    setTimeout(() => {
      hint.style.display = "none";
    }, 500);
  }
}

function updateAudioButton(playing) {
  const btn = document.getElementById("audioBtn");
  const btnText = document.getElementById("audioBtnText");
  btn.setAttribute("aria-pressed", playing ? "true" : "false");
  if (playing) {
    btn.classList.add("playing");
    btnText.textContent = "🔊 Playing";
  } else {
    btn.classList.remove("playing");
    btnText.textContent = "🔇 Muted";
  }
}

function toggleAudio() {
  const audio = document.getElementById("bgAudio");

  if (!audioStarted) {
    // First click - start playing
    audio
      .play()
      .then(() => {
        audioStarted = true;
        updateAudioButton(true);
        hideHint();
      })
      .catch(() => {
        // If play fails, try reloading source
        audio.src = shuffledPlaylist[currentTrackIndex];
        audio
          .play()
          .then(() => {
            audioStarted = true;
            updateAudioButton(true);
            hideHint();
          })
          .catch(() => {});
      });
  } else if (audio.paused) {
    // Resume playing
    audio
      .play()
      .then(() => {
        updateAudioButton(true);
      })
      .catch(() => {});
  } else {
    // Pause
    audio.pause();
    updateAudioButton(false);
  }
}

// Particles logic removed (replaced by static CSS orbs)

// ===== Confetti =====
function launchConfetti() {
  const colors = [
    "#8b5cf6",
    "#ec4899",
    "#fbbf24",
    "#34d399",
    "#60a5fa",
    "#f472b6",
    "#fff",
    "#fb923c",
  ];
  const shapes = ["circle", "square", "triangle", "star"];

  for (let i = 0; i < 80; i++) {
    setTimeout(() => {
      const confetti = document.createElement("div");
      confetti.classList.add("confetti");
      const shape = shapes[Math.floor(Math.random() * shapes.length)];
      confetti.style.left = Math.random() * 100 + "vw";
      confetti.style.top = "-20px";
      confetti.style.backgroundColor =
        colors[Math.floor(Math.random() * colors.length)];
      const size = Math.random() * 12 + 6;
      confetti.style.width = size + "px";
      confetti.style.height = size + "px";
      if (shape === "circle") confetti.style.borderRadius = "50%";
      else if (shape === "star") {
        confetti.style.borderRadius = "0";
        confetti.style.clipPath =
          "polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)";
      } else if (shape === "triangle") {
        confetti.style.width = "0";
        confetti.style.height = "0";
        confetti.style.borderLeft = size / 2 + "px solid transparent";
        confetti.style.borderRight = size / 2 + "px solid transparent";
        confetti.style.borderBottom =
          size +
          "px solid " +
          colors[Math.floor(Math.random() * colors.length)];
        confetti.style.backgroundColor = "transparent";
      }
      confetti.style.animationDuration = Math.random() * 2.5 + 2 + "s";
      confetti.style.animationDelay = Math.random() * 0.5 + "s";
      document.body.appendChild(confetti);
      setTimeout(() => confetti.remove(), 5000);
    }, i * 20);
  }
}

// ===== Mouse-Wheel → Horizontal Scroll on Project Tabs =====
// Lets desktop users scroll the tabs with the mouse wheel (no Shift needed)
(function () {
  const tabs = document.getElementById("projectTabs");
  if (!tabs) return;
  tabs.addEventListener("wheel", function (e) {
    // Only intercept when the tabs container is actually scrollable
    if (tabs.scrollWidth <= tabs.clientWidth) return;
    e.preventDefault();                        // stop page scroll
    tabs.scrollLeft += e.deltaY || e.deltaX;  // map vertical wheel → horizontal
  }, { passive: false });
})();

// ===== Toast (small transient feedback) =====
let _toastTimer = null;
function showToast(message) {
  let toast = document.getElementById("eeceToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "eeceToast";
    toast.className = "eece-toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  void toast.offsetWidth; // reflow so the transition always plays
  toast.classList.add("show");
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

// ===== Share =====
// Native share sheet on mobile; clipboard copy (with toast) everywhere else.
// Always shares the canonical production URL, never the dev preview deploy.
function shareSite() {
  const canonical =
    document.querySelector('link[rel="canonical"]')?.href ||
    location.origin + location.pathname;
  const shareData = {
    title: "EECE — Class of 2026",
    text: "EECE Class of 2026 — countdown, class yearbook & graduation projects 🎓",
    url: canonical,
  };

  if (navigator.share) {
    navigator.share(shareData).catch(() => {}); // user dismissed — ignore
  } else if (navigator.clipboard?.writeText) {
    navigator.clipboard
      .writeText(canonical)
      .then(() => showToast("🔗 Link copied to clipboard!"))
      .catch(() => showToast(canonical));
  } else {
    showToast(canonical);
  }
}

// ===== Back-to-Top Button =====
(function initScrollTop() {
  const btn = document.getElementById("scrollTopBtn");
  if (!btn) return;
  const SHOW_AFTER = 400; // px scrolled before the button appears
  let ticking = false;

  window.addEventListener(
    "scroll",
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        btn.classList.toggle("visible", window.scrollY > SHOW_AFTER);
        ticking = false;
      });
    },
    { passive: true },
  );

  btn.addEventListener("click", () =>
    window.scrollTo({ top: 0, behavior: "smooth" }),
  );
})();

// ===== Service Worker (PWA: installable + instant repeat loads) =====
// Registered after `load` so it never competes with the page's critical
// resources. Only runs over http(s) — silently skipped on file:// previews.
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("sw.js")
      .catch((err) => console.warn("SW registration failed:", err));
  });
}
