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
    // Keep the Firebase key on each project (as _key) so the project editor can
    // write back to the exact record.
    GRADUATION_PROJECTS = Array.isArray(projectsData)
      ? projectsData.map((p, i) => (p ? { ...p, _key: p._key || String(i) } : null)).filter(Boolean)
      : Object.entries(projectsData).map(([k, p]) => ({ ...p, _key: k }));

    GRADUATION_PROJECTS.forEach((project) => {
      if (project.team && !Array.isArray(project.team)) {
        project.team = Object.values(project.team);
      }
      applyHierarchyDefaults(project);
      applyProjectDefaults(project);
    });
  }
  // Expose for the portal module (ES module can't see top-level lets).
  window.GRADUATION_PROJECTS = GRADUATION_PROJECTS;

  // Patch photo URLs with the Cloudflare base URL now that we have data.
  if (typeof loadDrivePhotos === "function") loadDrivePhotos();

  // Rebuild cascading filters (fresh data may add new universities/years…).
  if (typeof buildYearbookFilters === "function") buildYearbookFilters();
  if (typeof buildProjectFilterPanel === "function") buildProjectFilterPanel();
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

  // A refresh / deep link landed on /profile/<id> before the data was ready —
  // reopen it now. Prefer the URL id (canonical), fall back to the saved key.
  if ((_pendingProfileId || _pendingProfileKey) && typeof openFullProfile === "function") {
    const s = (_pendingProfileId && findStudentById(_pendingProfileId)) ||
              (_pendingProfileKey && (STUDENTS || []).find((st) => studentKey(st) === _pendingProfileKey)) || null;
    if (s) {
      // Deep link to /profile/<id>/edit → open the INLINE editor (only if the
      // viewer owns the profile; openFullProfile enforces that and falls back to
      // read-only otherwise).
      _fpEditing = !!(_pendingEditAfterOpen && window.__myUid && s.ownerUid === window.__myUid);
      _pendingEditAfterOpen = false;
      openFullProfile(s);
      _pendingProfileKey = null;
      _pendingProfileId = null;
    } else if (_pendingProfileId) {
      // Data is now loaded but the id still doesn't resolve → the profile really
      // doesn't exist (bad/old shared link). Tell the user instead of silently
      // dropping them on the yearbook, and canonicalise the URL.
      if (typeof showToast === "function") showToast("That profile couldn't be found.");
      try { history.replaceState({ mode: "yearbook" }, "", "/yearbook"); } catch (_) {}
      _pendingProfileId = null;
      _pendingProfileKey = null;
    }
  } else if (_openProfileStudent && currentMode === "profile" && typeof openFullProfile === "function") {
    // A profile is already open (e.g. refresh landed on /profile/<id> and we
    // opened it from cache). Fresh data just arrived, so re-open it with the
    // up-to-date record from STUDENTS — otherwise a newly-set cover/photo that
    // wasn't in the cached object never appears until you leave and come back.
    const fresh = findStudentById(profileId(_openProfileStudent)) ||
                  (STUDENTS || []).find((st) => studentKey(st) === studentKey(_openProfileStudent));
    if (fresh && fresh !== _openProfileStudent && !_fpEditing) {
      openFullProfile(fresh, { fromHistory: true });
    }
  }

  // A refresh / deep link landed on /project/<id> before the data was ready.
  if (_pendingProjectId && typeof openProjectFromId === "function") {
    if (openProjectFromId(_pendingProjectId)) {
      _pendingProjectId = null;
    } else if ((GRADUATION_PROJECTS || []).length && !(GRADUATION_PROJECTS || []).some((p) => (p._key || "") === _pendingProjectId)) {
      // Projects are loaded but this key isn't among them → stale link.
      if (typeof showToast === "function") showToast("That project couldn't be found.");
      _pendingProjectId = null;
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
const DEFAULT_DEPARTMENT = "Electronics and Communication Engineering";

// Legacy projects only carried a short `category` key (Digital/Embedded/Network).
// A graduation project's TRACK set is a project-level attribute (what the project
// is about), independent of which tracks its members happen to belong to. Each
// project has ONE primary track plus optional sub-tracks. For older records that
// predate the explicit `track` field, seed the track set from the category. The
// FIRST entry is always the primary track.
const CAT_TO_TRACKS = {
  Digital: ["Digital IC Design", "ASIC Verification"],
  Embedded: ["Embedded Systems", "Embedded Linux", "IoT", "AI"],
  Network: ["Network"],
};

/**
 * The graduation project's own track set as an array (primary first). Prefers the
 * explicit project.track field; falls back to the legacy category mapping. NEVER
 * derived from members. Returns [] when nothing is known.
 */
function projectTracks(p) {
  if (!p) return [];
  let t = p.track !== undefined ? p.track : p.tracks;
  if (typeof t === "string") t = t.trim() ? [t.trim()] : [];
  else if (Array.isArray(t)) t = t.map((x) => String(x || "").trim()).filter(Boolean);
  else t = [];
  if (t.length) {
    // De-dup, preserve order (primary stays first).
    const seen = new Set();
    return t.filter((x) => (seen.has(x) ? false : (seen.add(x), true)));
  }
  if (p.category && CAT_TO_TRACKS[p.category]) return [...CAT_TO_TRACKS[p.category]];
  if (p.category) return [p.category];
  return [];
}

/** The project's single primary track (first of the set), or "". */
function projectPrimaryTrack(p) {
  const t = projectTracks(p);
  return t.length ? t[0] : "";
}

/**
 * Coerce a student/profile's track field into a clean de-duped array. After the
 * Firebase field normalization the canonical field is `tracks`, but we still read
 * a stray legacy `track` defensively so old cached payloads don't break.
 */
function studentTracks(rec) {
  let raw = rec && rec.tracks !== undefined ? rec.tracks : (rec && rec.track);
  if (typeof raw === "string") raw = raw.trim() ? [raw.trim()] : [];
  else if (Array.isArray(raw)) raw = raw.map((x) => String(x || "").trim()).filter(Boolean);
  else raw = [];
  const seen = new Set();
  return raw.filter((x) => (seen.has(x.toLowerCase()) ? false : (seen.add(x.toLowerCase()), true)));
}

/** Fill any missing hierarchy fields on a student/profile record in place. */
function applyHierarchyDefaults(rec) {
  if (!rec.university) rec.university = DEFAULT_UNIVERSITY;
  if (!rec.faculty) rec.faculty = DEFAULT_FACULTY;
  if (!rec.department) rec.department = DEFAULT_DEPARTMENT;
  if (!rec.classYear) rec.classYear = DEFAULT_CLASS_YEAR;
  // Canonicalise tracks onto BOTH `tracks` (the schema field) and `track` (the
  // alias every render/filter path already reads) so the whole app sees one,
  // consistent array no matter which field the source record used.
  const t = studentTracks(rec);
  rec.tracks = t;
  rec.track = t;
  return rec;
}

/**
 * Project-specific defaults. Stamps a `track` array derived from the legacy
 * category so old records (which only had `category`) filter correctly by
 * project track. Call AFTER applyHierarchyDefaults for projects.
 */
function applyProjectDefaults(proj) {
  // Normalise track to an array (primary first); seed from category if absent.
  const t = projectTracks(proj);
  if (t.length) proj.track = t;
  return proj;
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
      // Find the legacy /students record this profile supersedes so we can carry
      // its real Firebase key forward (needed for admin delete to remove BOTH the
      // profile and the legacy mirror). Match by name, then by email.
      let legacyKey = null;
      const nameKey = `name:${nrm(p.name)}`;
      if (byKey.has(nameKey)) legacyKey = byKey.get(nameKey)._key || null;
      if (p.email) {
        for (const [k, v] of byKey) {
          if (!v.ownerUid && nrm(v.email) === nrm(p.email)) { legacyKey = legacyKey || v._key || null; }
        }
      }
      // Drop the legacy duplicates this profile supersedes.
      byKey.delete(nameKey);
      if (p.email) {
        for (const [k, v] of byKey) {
          if (!v.ownerUid && nrm(v.email) === nrm(p.email)) byKey.delete(k);
        }
      }
      byKey.set(uid, applyHierarchyDefaults({
        name: p.name,
        gender: p.gender || "",
        photo: p.photo || "",
        // Canonical field is `tracks`; applyHierarchyDefaults mirrors it to `track`.
        tracks: p.tracks || p.track || [],
        skills: p.skills || [],
        color: p.color || "",
        social: p.social || {},
        university: p.university,
        faculty: p.faculty,
        department: p.department,
        classYear: p.classYear,
        email: p.email || "",
        ownerUid: uid,
        // Carry the legacy mirror's key so a delete can remove it too.
        _key: legacyKey || undefined,
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

// True when the current URL path matches a transient overlay route. These
// aren't real sections; they sit on top of one and are driven by their
// open/close funcs:
//   "student"      → /student            (quick card)
//   "profile"      → /profile/<id>       (full profile)
//   "profile-edit" → /profile/<id>/edit  (edit page)
function _isOverlayPath(name) {
  const seg = location.pathname.replace(/^\/+|\/+$/g, "");
  if (name === "student") return seg === "student";
  if (name === "profile") return /^profile\/[^/]+$/.test(seg);
  if (name === "profile-edit") return /^profile\/[^/]+\/edit$/.test(seg);
  return seg === name;
}

// Pull the <id> out of /profile/<id> or /profile/<id>/edit.
function profileIdFromPath(pathname = location.pathname) {
  const m = pathname.replace(/^\/+|\/+$/g, "").match(/^profile\/([^/]+)(?:\/edit)?$/);
  return m ? decodeURIComponent(m[1]) : null;
}

// Scroll position of the underlying section, saved when an overlay (quick card
// / full profile) opens so we can land back on the SAME card after closing,
// instead of being thrown to the top of the grid.
let _overlayReturnScroll = null;

// Re-apply a saved scroll position across several frames. A freshly re-rendered
// grid grows as its lazy images decode, so a single scrollTo lands short. We
// re-assert the target until the page is tall enough for it (or we give up after
// ~700ms), which keeps "Back from a profile" on the exact same card. Cancels on
// any user scroll/touch so we never fight the user.
function _restoreScrollRobust(target) {
  if (target == null) return;
  let cancelled = false;
  const stop = () => { cancelled = true; cleanup(); };
  const cleanup = () => {
    window.removeEventListener("wheel", stop, { passive: true });
    window.removeEventListener("touchmove", stop, { passive: true });
    window.removeEventListener("keydown", stop);
  };
  window.addEventListener("wheel", stop, { passive: true });
  window.addEventListener("touchmove", stop, { passive: true });
  window.addEventListener("keydown", stop);

  const start = performance.now();
  const tick = () => {
    if (cancelled) return;
    window.scrollTo(0, target);
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    const reached = Math.abs(window.scrollY - target) <= 2 || target > maxScroll + 2;
    if (reached || performance.now() - start > 700) { cleanup(); return; }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

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

  // Escape every user-authored field before it lands in innerHTML below. Names,
  // tracks, departments etc. are entered by students, so they could contain
  // "<", ">" or quotes — without this they'd be a stored-XSS vector.
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  // CSS colours are validated separately: only allow a safe subset (hex,
  // rgb/rgba, hsl, named colours, gradients) so style="" can't be broken out of.
  const safeColor = (c) => (/^[#a-z0-9 ,.()%-]*$/i.test(String(c || "")) ? String(c || "") : "");

  // ── Generate Tracks HTML ──
  let tracksHtml = "";
  let tracks = student.track;
  if (tracks) {
    if (!Array.isArray(tracks)) tracks = [tracks];
    const badges = tracks
      .map((t) => `<span class="student-track">${esc(t)}</span>`)
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
  if (metaBits.length) metaHtml = `<p class="modal-meta">${esc(metaBits.join(" · "))}</p>`;

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
                <a class="social-btn social-${esc(platform)}" href="${esc(cfg.buildUrl(value))}" target="_blank" rel="noopener noreferrer" title="${esc(cfg.title)}">
                    <img src="${esc(cfg.icon)}" alt="${esc(cfg.title)}" class="social-icon" />
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
  const initialsEsc = esc(getInitials(student.name));
  const colorEsc = safeColor(student.color);
  if (isAvatar) {
    photoHtml = `<div class="photo-modal-avatar" style="background: ${colorEsc}">${initialsEsc}</div>`;
  } else {
    photoHtml = `<div class="photo-modal-avatar" style="background: ${colorEsc}" id="_modalAvatarFallback">${initialsEsc}</div>
      <img id="_modalPhotoImg" alt="${esc(student.name)}" style="display:none" />`;
  }

  modal.setAttribute("aria-label", `${student.name} — details`);
  modal.innerHTML = `
        <span class="photo-modal-close" role="button" tabindex="0" aria-label="Close">&times;</span>
        <div class="photo-modal-content">
            ${photoHtml}
            <h3>${esc(student.name)}</h3>
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

  // Add state to browser history for mobile back button. We tag the entry with
  // the section it sits on (base mode) so popstate can tear the card down and
  // restore the right grid even if it's read as a navigation target. Opening a
  // member card from ON a full profile (Projects → member → profile → member)
  // must NOT clobber the section the profile returns to, so we keep the existing
  // base when one is already open.
  if (!_isOverlayPath("student")) {
    const base = _isOverlayPath("profile") ? _fpReturnMode : currentMode;
    // Remember where the user was in the grid so closing returns to the same
    // card rather than scrolling back to the very first one.
    if (!_isOverlayPath("profile")) _overlayReturnScroll = window.scrollY;
    history.pushState({ overlay: "student", mode: base }, "", "/student");
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
// The URL profile id awaiting data (deep link / refresh on /profile/<id>).
let _pendingProfileId = null;
// True when the deep link was /profile/<id>/edit — open the editor after the
// profile opens (owner only).
let _pendingEditAfterOpen = false;
// The URL project id awaiting data (deep link / refresh on /project/<id>).
let _pendingProjectId = null;

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

// ── URL-addressable profiles ──
// The profile is identified directly in the URL (/profile/<id>) so a refresh or
// a shared/deep link reconstructs it from the URL + Firebase — never from
// transient sessionStorage. The id is a human-readable name slug
// (e.g. "abdallah-shehawey"). When two people share a name we disambiguate by
// appending the short uid, but the bare slug still resolves to the first match.
function slugify(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[؀-ۿ]/g, "") // drop Arabic chars so the slug stays URL-clean
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// The id we put in the URL for a student. A stable slug; uniquified with the
// uid tail only when the bare slug would collide with someone else.
function profileId(student) {
  if (!student) return "";
  const base = slugify(student.name) || (student.ownerUid ? student.ownerUid.slice(0, 8) : "student");
  const sameSlug = (STUDENTS || []).filter((s) => slugify(s.name) === slugify(student.name));
  if (sameSlug.length > 1 && student.ownerUid) return `${base}-${student.ownerUid.slice(0, 6)}`;
  return base;
}

// Resolve a URL id back to a student record. Matches (in order) the uid tail,
// the exact slug, then a slug prefix — so both "/profile/abdallah-shehawey" and
// "/profile/abdallah-shehawey-ab12cd" land on the right person.
function findStudentById(id) {
  if (!id) return null;
  const students = STUDENTS || [];
  // 1) "<slug>-<uidPrefix>" — match by the uid tail when present.
  const m = id.match(/-([a-z0-9]{6})$/i);
  if (m) {
    const byUid = students.find((s) => s.ownerUid && s.ownerUid.slice(0, 6) === m[1]);
    if (byUid) return byUid;
  }
  // 2) Exact slug.
  const exact = students.find((s) => slugify(s.name) === id);
  if (exact) return exact;
  // 3) Slug prefix (handles the "<slug>-<uid>" form when the uid match missed).
  return students.find((s) => id.startsWith(slugify(s.name))) || null;
}

// Build the canonical path for a student's profile / edit page.
function profilePath(student) { return `/profile/${profileId(student)}`; }
function profileEditPath(student) { return `/profile/${profileId(student)}/edit`; }

// The student record currently rendered in the full-profile page. Kept so we
// can re-render it in place when auth resolves (owner's Edit button) without
// touching the history stack.
let _openProfileStudent = null;
// Whether the open profile is in inline-edit mode (drives /profile/<id>/edit).
let _fpEditing = false;

// Re-render the open profile after the auth state changes (called by portal.js
// from onAuthStateChanged). Re-running openFullProfile with fromHistory keeps
// the URL/history untouched but recomputes owner-only controls.
window.refreshOpenProfileAuth = function () {
  if (_openProfileStudent && currentMode === "profile") {
    openFullProfile(_openProfileStudent, { fromHistory: true });
  }
};

// Pristine markup of the read-only About panel, captured once. The inline editor
// overwrites #fpAbout's innerHTML, so we restore this template before every
// read-only render — otherwise the static fields (fpUniversity, fpTracks, …)
// would stay destroyed and setEl() would silently no-op.
let _fpAboutTemplate = null;

function openFullProfile(student, opts = {}) {
  const page = document.getElementById("fullProfile");
  if (!page || !student) return;
  _openProfileStudent = student;
  // The owner's "My profile" is hosted on the submit page (which is otherwise
  // blank behind the overlay) — return them to home on Back/close instead of a
  // dead-end submit page. Everyone else returns to the section they came from.
  // When navigating profile→profile (currentMode is already "profile"), keep the
  // EXISTING return section rather than recording "profile" — otherwise the
  // remembered base becomes the profile itself and Back/refresh has nothing to
  // land on underneath, dropping the user out of the site.
  _fpReturnMode = opts.returnMode || (currentMode && currentMode !== "profile" ? currentMode : _fpReturnMode) || "yearbook";

  const aboutEl = document.getElementById("fpAbout");
  if (aboutEl) {
    // Capture the pristine read-only template once, then ALWAYS restore it before
    // rendering. Read-only uses it directly; the inline editor rebuilds on top of
    // a clean panel. This guarantees exactly one editor and no orphaned nodes even
    // if openFullProfile runs twice (e.g. auth resolving mid-edit).
    if (_fpAboutTemplate == null) _fpAboutTemplate = aboutEl.innerHTML;
    else aboutEl.innerHTML = _fpAboutTemplate;
  }

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const initials = (student.name || "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  // Cover photo — robust lifecycle so it never "disappears":
  //   • no cover set        → gradient banner (clean default)
  //   • cover set           → show a loading shimmer, PRELOAD the image off-DOM,
  //                           apply it only once it actually decodes (so we never
  //                           paint a broken/empty box), retrying .jpg→.jpeg→.webp
  //                           like the avatar/yearbook photos. On total failure we
  //                           fall back to the gradient instead of a blank box.
  const cover = document.getElementById("fpCover");
  if (cover) {
    cover.classList.remove("is-loading", "has-cover");
    cover.style.backgroundImage = "";
    if (student.cover) {
      const base = String(student.cover).startsWith("http") ? student.cover : `${CLOUDFLARE_BASE_URL}/${student.cover}`;
      cover.classList.add("is-loading");
      // Token guards against a stale load winning after the user opened another
      // profile (race): only the latest open for this element may apply.
      const token = (cover._coverToken = (cover._coverToken || 0) + 1);
      let attempt = 0;
      const DELAYS = [0, 1500, 3500];
      const loadCover = () => {
        if (cover._coverToken !== token) return; // superseded
        let url = base;
        if (attempt === 1) url = base.replace(/\.jpg$/i, ".jpeg");
        else if (attempt === 2) url = base.replace(/\.jpg$/i, ".webp");
        else if (attempt > 2) { const sep = base.includes("?") ? "&" : "?"; url = base.replace(/\.jpg$/i, ".webp") + sep + "_r=" + attempt; }
        const img = new Image();
        img.onload = () => {
          if (cover._coverToken !== token) return;
          cover.style.backgroundImage = `url("${url}")`;
          cover.style.backgroundSize = "cover";
          cover.style.backgroundPosition = "center";
          cover.classList.remove("is-loading");
          cover.classList.add("has-cover");
        };
        img.onerror = () => {
          if (cover._coverToken !== token) return;
          if (attempt < 3) { attempt++; setTimeout(loadCover, DELAYS[attempt] || 4000); }
          else { cover.classList.remove("is-loading"); } // give up → gradient
        };
        img.src = url;
      };
      loadCover();
    }
  }

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
  setEl("fpDepartment", student.department || "Electronics and Communication Engineering");
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
  // Is the signed-in user viewing their OWN profile? (controls project-edit access)
  const isOwnerViewing = !!(window.__myUid && student.ownerUid && window.__myUid === student.ownerUid);
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
      // Use the SAME family-based category icon as the Projects tab so the
      // profile's Graduation Project card matches the grid card exactly.
      const catKey = categoryFamily(p.category);
      const icon = `<span class="fp-proj-icon cat-${catKey}">${categoryIcon(p.category).html}</span>`;
      const catLabel = CAT_LABELS[p.category] || p.category || "Project";
      // Any team member (or admin) may edit the project — shared ownership.
      const viewerIsMember = team.some((m) => norm(m.name) === norm(student.name));
      const canEdit = isOwnerViewing && (viewerIsMember || window.__isAdmin);
      const editBtn = canEdit
        ? `<button type="button" class="fp-proj-edit" data-proj-key="${esc(p._key || "")}">✎ Edit project</button>`
        : "";
      // Project's own tracks (primary first) — project metadata, not member tracks.
      const tracks = projectTracks(p);
      const tracksHtml = tracks.length
        ? `<div class="project-tracks">${tracks
            .map((t, i) => `<span class="project-track-chip${i === 0 ? " is-primary" : ""}">${esc(t)}</span>`)
            .join("")}</div>`
        : "";
      // Hierarchy line from the project's own metadata (with safe fallbacks).
      const metaBits = [
        p.university || DEFAULT_UNIVERSITY,
        p.department || DEFAULT_DEPARTMENT,
        p.classYear || DEFAULT_CLASS_YEAR,
      ].filter(Boolean);
      const metaHtml = `<p class="fp-proj-meta">${esc(metaBits.join(" · "))}</p>`;
      return `<div class="fp-proj-card">
        <div class="fp-proj-head">${icon} <strong>${esc(catLabel)}</strong> <span class="fp-proj-year">${esc(p.classYear || "")}</span>${editBtn}</div>
        ${tracksHtml}${metaHtml}
        ${desc}${repo}
        <h4 class="fp-proj-team-title">Team</h4>
        <div class="fp-member-grid">${members}</div>
      </div>`;
    }).join("");
    // Wire "Edit project" buttons (shared ownership: any listed member / admin).
    projPanel.querySelectorAll(".fp-proj-edit").forEach((btn) => {
      btn.addEventListener("click", () => {
        const proj = projects.find((p) => (p._key || "") === btn.dataset.projKey) || projects[0];
        if (typeof window.openProjectEditor === "function") window.openProjectEditor(proj);
      });
    });
    // Clicking a registered member opens THEIR quick card (the photo modal) on
    // top of this profile — from there the visitor can choose to open the full
    // profile if they want. Non-registered names aren't clickable.
    projPanel.querySelectorAll(".fp-member").forEach((btn) => {
      const rec = studentByName.get(norm(btn.dataset.name));
      if (!rec) { btn.classList.add("fp-member-static"); btn.disabled = true; return; }
      btn.addEventListener("click", () => openPhotoModal(rec));
    });
  } else if (projTabBtn && projPanel) {
    // No project on this person yet.
    if (isOwnerViewing) {
      // The owner sees an empty-state with a call to action so they can add one.
      projTabBtn.style.display = "";
      projPanel.innerHTML = `
        <div class="fp-proj-empty">
          <div class="fp-proj-empty-icon">🚀</div>
          <h4 class="fp-proj-empty-title">No GP Project Added Yet</h4>
          <p class="fp-proj-empty-sub">Add your graduation project so juniors and recruiters can see what you built.</p>
          <button type="button" class="btn-primary fp-add-proj">+ Add GP Project</button>
        </div>`;
      const addBtn = projPanel.querySelector(".fp-add-proj");
      if (addBtn) addBtn.addEventListener("click", () => {
        if (typeof window.openNewProjectForMe === "function") window.openNewProjectForMe();
      });
    } else {
      // Visitors just don't see the tab when there's nothing to show.
      projTabBtn.style.display = "none";
      projPanel.innerHTML = "";
    }
  }

  // Edit button only for the profile owner (portal exposes the current uid).
  const editBtn = document.getElementById("fpEditBtn");
  if (editBtn) {
    const isOwner = window.__myUid && student.ownerUid && window.__myUid === student.ownerUid;
    editBtn.style.display = (isOwner && !_fpEditing) ? "" : "none";
    // Enter INLINE edit on this same page (no jump to a separate form). Pushes a
    // /profile/<id>/edit history entry so Back cancels the edit cleanly.
    editBtn.onclick = () => {
      _fpEditing = true;
      openFullProfile(student); // re-renders in edit mode + pushes /edit entry
    };
  }

  fpShowTab("about");
  // Remember the grid scroll position before the profile takes over the screen,
  // so closing the profile lands back on the same card. (When we arrived via the
  // quick card, openPhotoModal already captured it — don't clobber that.)
  if (currentMode !== "profile" && !_isOverlayPath("student") && !_isOverlayPath("profile")) {
    _overlayReturnScroll = window.scrollY;
  }
  // Remember the section underneath so popstate/back can return there. The
  // profile is addressed directly in the URL (/profile/<id>); on refresh or a
  // shared link we reconstruct it from that id + Firebase.
  const id = profileId(student);
  try {
    sessionStorage.setItem("eece-open-profile",
      JSON.stringify({ from: _fpReturnMode, student: studentKey(student), id }));
  } catch (_) {}
  // Render the inline editor only if we're in edit mode AND the viewer owns this
  // profile. (A non-owner can't reach edit; a deep-linked /edit by a non-owner
  // silently falls back to the read-only view.)
  const _isOwner = !!(window.__myUid && student.ownerUid && window.__myUid === student.ownerUid);
  if (_fpEditing && _isOwner) { _renderProfileEditInline(student); }
  else if (_fpEditing && !_isOwner && window.__myUid) { _fpEditing = false; }
  // The profile is now a real SPA view: let switchMode show the section and own
  // the single history entry. A history replay (Back/Forward) passes fromHistory
  // so switchMode won't push again. A profile→profile change (different member)
  // pushes a fresh /profile/<id> entry.
  if (opts.fromHistory) {
    if (typeof switchMode === "function") switchMode("profile", true);
  } else {
    if (typeof switchMode === "function") switchMode("profile");
  }
}
function closeFullProfile() {
  const page = document.getElementById("fullProfile");
  if (page) page.style.display = "none";
  document.body.classList.remove("fp-open");
  _openProfileStudent = null;
  _fpEditing = false;
  try { sessionStorage.removeItem("eece-open-profile"); } catch (_) {}
}

// Create a profile using the SAME inline editor as "edit" (unified design),
// instead of the old form. Seeds an empty student owned by the current user,
// pre-filled with their Google name/photo, and opens straight into edit mode.
function openCreateProfileInline() {
  if (!window.__myUid) {  // not signed in yet — let portal handle the sign-in CTA
    if (typeof window.requireSignInForProfile === "function") window.requireSignInForProfile();
    return;
  }
  const g = (typeof window.__googleProfile === "function") ? window.__googleProfile() : {};
  const seed = {
    name: g.name || "",
    photo: "", cover: "",
    university: "Al-Azhar University",
    faculty: "Faculty of Engineering",
    department: "",
    classYear: "",
    track: [], tracks: [],
    skills: [],
    social: { linkedin: "", github: "", whatsapp: "", facebook: "" },
    ownerUid: window.__myUid,
    _isNewProfile: true,
    _key: "__new__",
  };
  _fpEditing = true;
  const m = document.body.dataset.mode;
  // After save/cancel of a brand-new profile, the yearbook is the most useful
  // landing spot (home/submit/admin aren't where they'll want to be).
  _fpReturnMode = (m && m !== "submit" && m !== "admin" && m !== "home") ? m : "yearbook";
  openFullProfile(seed);
}
window.openCreateProfileInline = openCreateProfileInline;

// Distinct values used by approved students for a hierarchy field, plus a small
// curated seed, de-duplicated case/space-insensitively. Powers the inline-edit
// dropdowns the same way the form does — dynamic, no hardcoded master list.
// Full pick-lists so a student can choose their own university/faculty/department
// from a complete menu (not just whatever already exists in the data). Kept in
// sync with the UNIVERSITIES / FACULTIES / DEPARTMENTS constants in portal.js.
const _INST_SEED = {
  university: [
    "Al-Azhar University", "Cairo University", "Ain Shams University", "Alexandria University",
    "Mansoura University", "Helwan University", "Zagazig University", "Assiut University",
    "Tanta University", "Benha University", "Menoufia University", "Suez Canal University",
    "South Valley University", "Fayoum University", "Beni-Suef University", "Kafr El-Sheikh University",
    "Damietta University", "Aswan University", "Minia University", "Sohag University",
    "Port Said University", "The British University in Egypt (BUE)", "German University in Cairo (GUC)",
    "American University in Cairo (AUC)", "Nile University", "Misr University for Science & Technology (MUST)",
    "Future University in Egypt (FUE)", "October 6 University", "Egyptian Russian University",
  ],
  faculty: [
    "Faculty of Engineering", "Faculty of Engineering & Technology",
    "Faculty of Computers & Artificial Intelligence", "Faculty of Computers & Information",
    "Faculty of Computer Engineering", "Higher Institute of Engineering",
  ],
  department: [
    "Electronics and Communication Engineering", "Computer Engineering", "Electrical Power & Machines",
    "Mechanical Engineering", "Civil Engineering", "Architecture Engineering", "Mechatronics Engineering",
    "Biomedical Engineering", "Chemical Engineering", "Computer Science", "Information Systems",
    "Artificial Intelligence", "Software Engineering",
  ],
};
function _knownInst(field) {
  const byKey = new Map();
  const add = (v) => { const c = String(v || "").replace(/\s+/g, " ").trim(); if (c && !byKey.has(c.toLowerCase())) byKey.set(c.toLowerCase(), c); };
  (_INST_SEED[field] || []).forEach(add);
  (STUDENTS || []).forEach((s) => add(s[field]));
  (GRADUATION_PROJECTS || []).forEach((p) => add(p[field]));
  return Array.from(byKey.values()).sort((a, b) => a.localeCompare(b));
}
function _knownTrackPoolJS() {
  const byKey = new Map();
  const add = (v) => { const c = String(v || "").replace(/\s+/g, " ").trim(); if (c && !byKey.has(c.toLowerCase())) byKey.set(c.toLowerCase(), c); };
  (STUDENTS || []).forEach((s) => (Array.isArray(s.track) ? s.track : s.track ? [s.track] : []).forEach(add));
  (GRADUATION_PROJECTS || []).forEach((p) => (projectTracks(p) || []).forEach(add));
  return Array.from(byKey.values()).sort((a, b) => a.localeCompare(b));
}

// Render the profile's About panel as an INLINE editor (same page, same layout,
// fields editable in place). Reuses window.saveProfileInline (portal.js) so all
// canonicalisation / validation / security live in one place.
function _renderProfileEditInline(student) {
  const about = document.getElementById("fpAbout");
  if (!about) return;
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // Working copy of the editable fields.
  const tracks0 = Array.isArray(student.track) ? [...student.track] : (student.track ? [student.track] : []);
  const st = {
    name: student.name || "",
    university: student.university || "",
    faculty: student.faculty || "",
    department: student.department || "",
    classYear: student.classYear || "",
    tracks: tracks0,
    social: Object.assign({ linkedin: "", github: "", whatsapp: "", facebook: "" }, student.social || {}),
  };

  const selOpts = (field, val) => {
    const opts = _knownInst(field);
    const has = opts.some((o) => o.toLowerCase() === String(val || "").toLowerCase());
    return [
      `<option value="" ${val ? "" : "selected"} disabled>Select…</option>`,
      ...opts.map((o) => `<option value="${esc(o)}" ${o.toLowerCase() === String(val || "").toLowerCase() ? "selected" : ""}>${esc(o)}</option>`),
      `<option value="__other" ${val && !has ? "selected" : ""}>Other…</option>`,
    ].join("");
  };
  const yearOpts = (val) => {
    const years = ["2030", "2029", "2028", "2027", "2026", "2025", "2024", "2023", "2022", "2021", "2020"];
    const has = years.includes(String(val));
    return [
      `<option value="" ${val ? "" : "selected"} disabled>Select…</option>`,
      ...years.map((y) => `<option value="${y}" ${String(val) === y ? "selected" : ""}>${y}</option>`),
      `<option value="__other" ${val && !has ? "selected" : ""}>Other…</option>`,
    ].join("");
  };
  const otherVis = (field, val) => (val && !_knownInst(field).some((o) => o.toLowerCase() === String(val).toLowerCase())) ? "" : "hidden";

  about.innerHTML = `
    <div class="fp-edit">
      <div class="fp-edit-field fp-edit-name">
        <label>Full name</label>
        <input type="text" class="field-input" id="fpeName" value="${esc(st.name)}" />
      </div>
      <div class="fp-grid">
        <div class="fp-info-card">
          <span class="fp-info-label">University</span>
          <select class="field-input" id="fpeUniversity">${selOpts("university", st.university)}</select>
          <input type="text" class="field-input ${otherVis("university", st.university)}" id="fpeUniversityOther" placeholder="Type your university" value="${esc(otherVis("university", st.university) === "" ? st.university : "")}" />
        </div>
        <div class="fp-info-card">
          <span class="fp-info-label">Faculty</span>
          <select class="field-input" id="fpeFaculty">${selOpts("faculty", st.faculty)}</select>
          <input type="text" class="field-input ${otherVis("faculty", st.faculty)}" id="fpeFacultyOther" placeholder="Type your faculty" value="${esc(otherVis("faculty", st.faculty) === "" ? st.faculty : "")}" />
        </div>
        <div class="fp-info-card">
          <span class="fp-info-label">Department</span>
          <select class="field-input" id="fpeDepartment">${selOpts("department", st.department)}</select>
          <input type="text" class="field-input ${otherVis("department", st.department)}" id="fpeDepartmentOther" placeholder="Type your department" value="${esc(otherVis("department", st.department) === "" ? st.department : "")}" />
        </div>
        <div class="fp-info-card">
          <span class="fp-info-label">Class Year</span>
          <select class="field-input" id="fpeClassYear">${yearOpts(st.classYear)}</select>
          <input type="text" class="field-input ${(st.classYear && !["2030","2029","2028","2027","2026","2025","2024","2023","2022","2021","2020"].includes(String(st.classYear)))?"":"hidden"}" id="fpeClassYearOther" inputmode="numeric" maxlength="4" placeholder="4-digit year" value="${esc((st.classYear && !["2030","2029","2028","2027","2026","2025","2024","2023","2022","2021","2020"].includes(String(st.classYear)))?st.classYear:"")}" />
        </div>
      </div>
      <div class="fp-section">
        <h3 class="fp-section-title">Tracks</h3>
        <!-- Same dropdown multi-select as Create Profile: a button opens a menu of
             checkable tracks (existing ones pre-checked), chosen tracks show as
             removable chips, and a free-text row adds custom tracks. -->
        <div class="track-select" id="fpeTrackSelect">
          <button type="button" class="track-select-btn" id="fpeTrackBtn" aria-haspopup="true" aria-expanded="false">
            <span class="track-select-placeholder">Select your track(s)…</span>
            <svg class="track-chevron" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
          </button>
          <div class="track-menu" id="fpeTrackMenu" role="listbox" aria-multiselectable="true">
            <div class="track-menu-other">
              <input type="text" id="fpeTrackOther" class="track-other-input" placeholder="Add another track…" />
              <button type="button" class="track-other-add" id="fpeTrackOtherAdd">Add</button>
            </div>
          </div>
        </div>
        <div class="chip-container" id="fpeTracks" aria-label="Selected tracks"></div>
      </div>
      <div class="fp-section">
        <h3 class="fp-section-title">Connect</h3>
        <div class="fp-edit-socials">
          <input type="url" class="field-input" id="fpeLinkedin" placeholder="LinkedIn URL" value="${esc(st.social.linkedin || "")}" />
          <input type="url" class="field-input" id="fpeGithub" placeholder="GitHub URL" value="${esc(st.social.github || "")}" />
          <input type="tel" class="field-input" id="fpeWhatsapp" placeholder="WhatsApp (+20…)" value="${esc(st.social.whatsapp || "")}" />
          <input type="url" class="field-input" id="fpeFacebook" placeholder="Facebook URL" value="${esc(st.social.facebook || "")}" />
        </div>
      </div>
      <div class="fp-edit-actions">
        <button type="button" class="btn-secondary" id="fpeCancel">Cancel</button>
        <button type="button" class="btn-primary" id="fpeSave">💾 Save profile</button>
      </div>
      <p class="fp-edit-status" id="fpeStatus" style="display:none;"></p>
    </div>`;

  // Wire "Other…" reveal for the four selects.
  [["fpeUniversity", "fpeUniversityOther"], ["fpeFaculty", "fpeFacultyOther"], ["fpeDepartment", "fpeDepartmentOther"], ["fpeClassYear", "fpeClassYearOther"]].forEach(([selId, otherId]) => {
    const sel = document.getElementById(selId), oth = document.getElementById(otherId);
    if (sel && oth) sel.addEventListener("change", () => { oth.classList.toggle("hidden", sel.value !== "__other"); if (sel.value === "__other") oth.focus(); });
  });

  // ── Tracks: dropdown multi-select (mirrors the Create Profile picker) ──────
  // The user's existing tracks come in pre-selected (st.tracks); the menu lists
  // every known track with the chosen ones checked, plus a row to add a custom
  // one. Selected tracks render as removable chips beneath the button.
  const tracksWrap = document.getElementById("fpeTracks");
  const trackBtn = document.getElementById("fpeTrackBtn");
  const trackMenu = document.getElementById("fpeTrackMenu");
  const trackOtherInput = document.getElementById("fpeTrackOther");
  const trackOtherAdd = document.getElementById("fpeTrackOtherAdd");
  const hasTrack = (t) => st.tracks.some((x) => x.toLowerCase() === t.toLowerCase());

  // Known pool = every track on the site + whatever the user already has.
  const trackPool = () => {
    const byKey = new Map();
    const add = (v) => { const c = String(v || "").replace(/\s+/g, " ").trim(); if (c && !byKey.has(c.toLowerCase())) byKey.set(c.toLowerCase(), c); };
    _knownTrackPoolJS().forEach(add);
    st.tracks.forEach(add);
    return Array.from(byKey.values()).sort((a, b) => a.localeCompare(b));
  };

  const updateTrackBtnLabel = () => {
    const ph = trackBtn.querySelector(".track-select-placeholder");
    if (!ph) return;
    const n = st.tracks.length;
    ph.textContent = n === 0 ? "Select your track(s)…" : `${n} track${n > 1 ? "s" : ""} selected`;
    ph.classList.toggle("has-value", n > 0);
  };

  const renderTrackChips = () => {
    tracksWrap.innerHTML = st.tracks.length
      ? st.tracks.map((t, i) => `<span class="chip is-editable">${esc(t)}<button type="button" class="chip-x" data-i="${i}" aria-label="Remove">✕</button></span>`).join("")
      : `<span class="fp-muted">No tracks yet.</span>`;
    tracksWrap.querySelectorAll(".chip-x").forEach((b) => b.addEventListener("click", () => {
      st.tracks.splice(+b.dataset.i, 1); renderTrackChips(); renderTrackMenu(); updateTrackBtnLabel();
    }));
  };

  const renderTrackMenu = () => {
    const otherRow = trackMenu.querySelector(".track-menu-other");
    trackMenu.querySelectorAll(".track-option").forEach((el) => el.remove());
    const frag = document.createDocumentFragment();
    trackPool().forEach((t) => {
      const row = document.createElement("label");
      row.className = "track-option";
      row.innerHTML = `<input type="checkbox" value="${esc(t)}" ${hasTrack(t) ? "checked" : ""}> <span>${esc(t)}</span>`;
      row.querySelector("input").addEventListener("change", (e) => {
        if (e.target.checked) { if (!hasTrack(t)) st.tracks.push(t); }
        else st.tracks = st.tracks.filter((x) => x.toLowerCase() !== t.toLowerCase());
        renderTrackChips(); updateTrackBtnLabel();
      });
      frag.appendChild(row);
    });
    trackMenu.insertBefore(frag, otherRow);
  };

  const addCustomTrack = () => {
    const raw = String(trackOtherInput.value || "");
    raw.split(",").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean).forEach((t) => { if (!hasTrack(t)) st.tracks.push(t); });
    trackOtherInput.value = "";
    renderTrackMenu(); renderTrackChips(); updateTrackBtnLabel();
  };
  trackOtherAdd.addEventListener("click", addCustomTrack);
  trackOtherInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addCustomTrack(); } });

  // Open/close the dropdown (click outside closes).
  trackBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = trackMenu.classList.toggle("open");
    trackBtn.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) renderTrackMenu();
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#fpeTrackSelect")) { trackMenu.classList.remove("open"); trackBtn.setAttribute("aria-expanded", "false"); }
  });

  renderTrackChips();
  updateTrackBtnLabel();

  const readSel = (selId, otherId) => {
    const sel = document.getElementById(selId);
    if (sel && sel.value === "__other") { const o = document.getElementById(otherId); return o ? o.value.trim() : ""; }
    return sel ? sel.value : "";
  };

  // ── Photo + cover editing (camera buttons over the hero) ────────────────
  // Picked files are held until Save; the hero shows an instant local preview.
  const imgState = { photoFile: null, coverFile: null };
  const cover = document.getElementById("fpCover");
  const avatar = document.getElementById("fpAvatar");
  // Inject a camera button + hidden file input onto a hero element once.
  const addPicker = (host, kind) => {
    if (!host || host.querySelector(".fp-cam")) return;
    host.classList.add("fp-editable-img");
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = "image/*"; inp.className = "fp-cam-input"; inp.style.display = "none";
    const btn = document.createElement("button");
    btn.type = "button"; btn.className = "fp-cam"; btn.setAttribute("aria-label", `Change ${kind}`);
    btn.innerHTML = "📷";
    btn.addEventListener("click", (e) => { e.stopPropagation(); inp.click(); });
    inp.addEventListener("change", () => {
      const file = inp.files && inp.files[0];
      if (!file || !file.type.startsWith("image/")) return;
      // The upload pipeline (window.uploadProfileImage) compresses to WebP before
      // sending, so big phone photos are fine — they shrink dramatically. Only
      // reject files so large that decoding them into a canvas could hang/OOM.
      if (file.size > 25 * 1024 * 1024) { alert("Image is too large (over 25 MB). Please pick a smaller one."); inp.value = ""; return; }
      imgState[kind === "cover" ? "coverFile" : "photoFile"] = file;
      const url = URL.createObjectURL(file);
      if (kind === "cover") host.style.backgroundImage = `url("${url}")`;
      else host.style.backgroundImage = `url("${url}")`;
      host.classList.add("has-img");
    });
    host.appendChild(inp); host.appendChild(btn);
  };
  addPicker(cover, "cover");
  addPicker(avatar, "avatar");

  // Cancel → for an existing profile, back to its read-only view; for a brand-new
  // profile (nothing to show yet) leave to the yearbook instead.
  document.getElementById("fpeCancel").addEventListener("click", () => {
    _fpEditing = false;
    if (student._isNewProfile) {
      closeFullProfile();
      switchMode(_fpReturnMode || "yearbook");
      return;
    }
    openFullProfile(student, { fromHistory: true });
    try { history.replaceState({ mode: "profile" }, "", modeToPath("profile")); } catch (_) {}
  });

  // Save → persist via portal, then re-render the read-only page in place.
  document.getElementById("fpeSave").addEventListener("click", async () => {
    const statusEl = document.getElementById("fpeStatus");
    const fail = (m) => { statusEl.style.display = ""; statusEl.textContent = m; statusEl.className = "fp-edit-status is-error"; };
    if (typeof window.saveProfileInline !== "function") return fail("Editor unavailable — please reload.");
    const fields = {
      name: document.getElementById("fpeName").value.trim(),
      university: readSel("fpeUniversity", "fpeUniversityOther"),
      faculty: readSel("fpeFaculty", "fpeFacultyOther"),
      department: readSel("fpeDepartment", "fpeDepartmentOther"),
      classYear: readSel("fpeClassYear", "fpeClassYearOther"),
      tracks: st.tracks,
      social: {
        linkedin: document.getElementById("fpeLinkedin").value.trim(),
        github: document.getElementById("fpeGithub").value.trim(),
        whatsapp: document.getElementById("fpeWhatsapp").value.trim(),
        facebook: document.getElementById("fpeFacebook").value.trim(),
      },
    };
    statusEl.style.display = ""; statusEl.className = "fp-edit-status"; statusEl.textContent = "Saving…";

    // Upload any newly-picked images first, remembering the old keys so we can
    // delete them after the profile save succeeds (so we never orphan the live
    // image if the save fails).
    const oldPhoto = student.photo || "";
    const oldCover = student.cover || "";
    try {
      if (imgState.photoFile && typeof window.uploadProfileImage === "function") {
        statusEl.textContent = "Uploading photo…";
        const path = window.profileImagePath(fields.name || student.name, { cover: false });
        await window.uploadProfileImage(imgState.photoFile, path, { cover: false });
        fields.photo = path;
      }
      if (imgState.coverFile && typeof window.uploadProfileImage === "function") {
        statusEl.textContent = "Uploading cover…";
        const path = window.profileImagePath(fields.name || student.name, { cover: true });
        await window.uploadProfileImage(imgState.coverFile, path, { cover: true });
        fields.cover = path;
      }
    } catch (e) {
      return fail("Image upload failed: " + (e.message || e));
    }

    statusEl.textContent = "Saving…";
    const res = await window.saveProfileInline(fields);
    if (!res.ok) return fail(res.error || "Save failed.");
    statusEl.textContent = res.live ? "Saved ✓" : "Submitted for approval ✓";

    // Save succeeded — clean up replaced images from Cloudflare (best-effort).
    if (typeof window.deleteProfileImage === "function") {
      if (fields.photo && oldPhoto && oldPhoto !== fields.photo) window.deleteProfileImage(oldPhoto);
      if (fields.cover && oldCover && oldCover !== fields.cover) window.deleteProfileImage(oldCover);
    }
    // Re-render the read-only profile with the saved values (no nav jump).
    _fpEditing = false;
    const canonTracks = (res.profile && res.profile.tracks) || fields.tracks;
    const updated = Object.assign({}, student, fields, {
      track: canonTracks, tracks: canonTracks,
      university: (res.profile && res.profile.university) || fields.university,
      faculty: (res.profile && res.profile.faculty) || fields.faculty,
      department: (res.profile && res.profile.department) || fields.department,
      photo: fields.photo != null ? fields.photo : student.photo,
      cover: fields.cover != null ? fields.cover : student.cover,
    });
    setTimeout(() => {
      openFullProfile(updated, { fromHistory: true });
      try { history.replaceState({ mode: "profile" }, "", modeToPath("profile")); } catch (_) {}
    }, 500);
  });

  // Hide the read-only Tracks/Skills/Social sections + the project tab while editing.
  ["fpTracksWrap", "fpSkillsWrap", "fpSocialWrap"].forEach((id) => { const el = document.getElementById(id); if (el) el.style.display = "none"; });
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
  // Step ONE entry back through history; popstate replays whatever's underneath
  // (a section, or another profile). Symmetric, like a normal page.
  if (back) back.addEventListener("click", () => {
    if (_fpEditing) {
      // Cancel inline edit → back to the read-only profile (no nav step).
      _fpEditing = false;
      if (_openProfileStudent) openFullProfile(_openProfileStudent, { fromHistory: true });
      try { history.replaceState({ mode: "profile" }, "", modeToPath("profile")); } catch (_) {}
      return;
    }
    if (window.history.length > 1) history.back();
    else if (typeof switchMode === "function") switchMode(_fpReturnMode || "yearbook");
  });
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

let currentSearchQuery = "";

// ===== Yearbook filters (popover: University / Faculty / Department / Track) =====
// Each dimension is an independent multi-select. A student matches a dimension
// if it has NO selections, or its value is one of the selected ones (OR within
// a dimension). Dimensions combine with AND. So you can filter by track only,
// university only, or any mix — none depends on the others.
const FILTER_DIMENSIONS = [
  { key: "university", label: "University", field: "university", fallback: () => DEFAULT_UNIVERSITY },
  { key: "faculty", label: "Faculty", field: "faculty", fallback: () => DEFAULT_FACULTY },
  { key: "department", label: "Department", field: "department", fallback: () => DEFAULT_DEPARTMENT },
  { key: "classYear", label: "Class", field: "classYear", fallback: () => DEFAULT_CLASS_YEAR },
  { key: "track", label: "Track", field: "track", multi: true, fallback: () => "" },
];
const yearbookFilter = {
  university: new Set(),
  faculty: new Set(),
  department: new Set(),
  classYear: new Set(),
  track: new Set(),
};

// All values a student contributes to a dimension (tracks can be an array).
function _studentValues(s, dim) {
  if (dim.multi) {
    let v = s[dim.field];
    if (!v) return [];
    return (Array.isArray(v) ? v : [v]).filter(Boolean);
  }
  return [s[dim.field] || dim.fallback()].filter(Boolean);
}

// Count how many students fall under each value of a dimension, honouring the
// OTHER active dimensions (so counts reflect what you'd actually get). This is
// what lets us hide options nobody matches and show a live count beside each.
function _countsForDimension(dim) {
  const counts = new Map();
  STUDENTS.forEach((s) => {
    // A value's count should reflect every other active filter except this one.
    if (!matchesYearbookScope(s, dim.key)) return;
    _studentValues(s, dim).forEach((v) => counts.set(v, (counts.get(v) || 0) + 1));
  });
  return counts;
}

// Order class years newest-first; otherwise alphabetical.
function _sortFilterValues(key, values) {
  if (key === "classYear") {
    return [...values].sort((a, b) => {
      const na = parseInt(a, 10), nb = parseInt(b, 10);
      if (isNaN(na) && isNaN(nb)) return a.localeCompare(b);
      if (isNaN(na)) return 1;
      if (isNaN(nb)) return -1;
      return nb - na;
    });
  }
  return [...values].sort((a, b) => a.localeCompare(b));
}

// Build / refresh the filter popover. Only renders an option when at least one
// person matches it (given the other active filters), with a count beside it.
// A whole group is hidden when it has fewer than two real options to pick from.
function buildFilterPanel() {
  const groupsWrap = document.getElementById("filterGroups");
  if (!groupsWrap) return;

  // Drop any active selections that no longer exist in the data (e.g. after a
  // refresh removed a student) so stale chips don't linger.
  FILTER_DIMENSIONS.forEach((dim) => {
    const present = new Set();
    STUDENTS.forEach((s) => _studentValues(s, dim).forEach((v) => present.add(v)));
    yearbookFilter[dim.key].forEach((v) => { if (!present.has(v)) yearbookFilter[dim.key].delete(v); });
  });

  const html = FILTER_DIMENSIONS.map((dim) => {
    const counts = _countsForDimension(dim);
    const selected = yearbookFilter[dim.key];
    // Include selected values even if currently zero-count so the user can untick them.
    const values = _sortFilterValues(dim.key, new Set([...counts.keys(), ...selected]));
    // Hide a group only when it has NO real values at all. (We intentionally show
    // single-value groups like University/Department/Class so the visitor can see
    // the cohort that's actually present — e.g. "Al-Azhar University · 27".)
    if (values.length === 0) return "";

    const opts = values.map((v) => {
      const n = counts.get(v) || 0;
      const isOn = selected.has(v);
      const esc = (x) => String(x).replace(/"/g, "&quot;");
      return `<button type="button" class="filter-opt${isOn ? " is-on" : ""}" role="checkbox" aria-checked="${isOn}"
        data-dim="${dim.key}" data-val="${esc(v)}">
        <span class="filter-opt-check" aria-hidden="true"></span>
        <span class="filter-opt-label">${esc(v)}</span>
        <span class="filter-opt-count">${n}</span>
      </button>`;
    }).join("");

    return `<div class="filter-group" data-dim="${dim.key}">
      <div class="filter-group-title">${dim.label}</div>
      <div class="filter-opts">${opts}</div>
    </div>`;
  }).join("");

  groupsWrap.innerHTML = html || `<p class="filter-empty">No filters available yet.</p>`;
  updateFilterButtonCount();
  renderActiveFilterChips();
}

// Total number of active selections across all dimensions.
function _activeFilterCount() {
  return FILTER_DIMENSIONS.reduce((n, dim) => n + yearbookFilter[dim.key].size, 0);
}

// Reflect the active-filter count on the Filter button's badge.
function updateFilterButtonCount() {
  const badge = document.getElementById("filterCount");
  if (!badge) return;
  const n = _activeFilterCount();
  badge.textContent = n;
  badge.style.display = n ? "" : "none";
  const btn = document.getElementById("filterToggleBtn");
  if (btn) btn.classList.toggle("has-active", n > 0);
}

// Removable chips under the search row, one per active selection.
function renderActiveFilterChips() {
  const wrap = document.getElementById("activeFilters");
  if (!wrap) return;
  const chips = [];
  FILTER_DIMENSIONS.forEach((dim) => {
    yearbookFilter[dim.key].forEach((v) => {
      const esc = (x) => String(x).replace(/"/g, "&quot;");
      chips.push(`<button type="button" class="active-filter-chip" data-dim="${dim.key}" data-val="${esc(v)}">
        ${esc(v)} <span class="active-filter-x" aria-hidden="true">×</span>
      </button>`);
    });
  });
  wrap.innerHTML = chips.join("");
  wrap.style.display = chips.length ? "" : "none";
}

// Toggle a single value in a dimension, then re-filter + rebuild counts.
function toggleFilterValue(dimKey, val) {
  const set = yearbookFilter[dimKey];
  if (set.has(val)) set.delete(val); else set.add(val);
  buildFilterPanel();
  applyFilters();
}

function clearAllFilters() {
  FILTER_DIMENSIONS.forEach((dim) => yearbookFilter[dim.key].clear());
  buildFilterPanel();
  applyFilters();
}

// Wire the filter button, popover and option/chip clicks (called once at init).
function initYearbookFilters() {
  const btn = document.getElementById("filterToggleBtn");
  const panel = document.getElementById("filterPanel");
  const groups = document.getElementById("filterGroups");
  const clearBtn = document.getElementById("filterClearBtn");
  const chipsWrap = document.getElementById("activeFilters");
  const backdrop = document.getElementById("filterSheetBackdrop");
  const sheetClose = document.getElementById("filterSheetClose");
  const sheetReset = document.getElementById("filterSheetReset");
  const sheetApply = document.getElementById("filterSheetApply");

  // On phones the panel is a bottom sheet: it needs a backdrop and a page-scroll
  // lock. We detect the sheet breakpoint at open time so a rotation/resize is
  // honoured. Closing always cleans both up regardless of viewport.
  //
  // The panel normally lives inside .yb-filter-wrap (so the desktop popover
  // anchors to the button). But .container is a stacking context (z-index:1), so
  // a fixed sheet inside it can't rise above the body-level backdrop. As a sheet
  // we PORTAL the panel to <body> on open and return it to its anchor on close.
  const isSheet = () => window.matchMedia("(max-width: 700px)").matches;
  const homeParent = panel ? panel.parentNode : null;
  const openPanel = () => {
    if (!panel) return;
    if (isSheet()) {
      document.body.appendChild(panel);           // escape .container's context
      if (backdrop) backdrop.hidden = false;
      document.body.classList.add("filter-sheet-open");
    }
    panel.style.display = "";
    btn.setAttribute("aria-expanded", "true");
  };
  const closePanel = () => {
    if (!panel) return;
    panel.style.display = "none";
    btn.setAttribute("aria-expanded", "false");
    if (backdrop) backdrop.hidden = true;
    document.body.classList.remove("filter-sheet-open");
    if (homeParent && panel.parentNode !== homeParent) homeParent.appendChild(panel); // restore anchor
  };

  if (btn) btn.addEventListener("click", (e) => {
    e.stopPropagation();
    (panel && panel.style.display === "none") ? openPanel() : closePanel();
  });
  // Bottom-sheet controls: × and backdrop dismiss; Reset clears; "Show results"
  // (filters already applied live) just closes the sheet.
  if (sheetClose) sheetClose.addEventListener("click", (e) => { e.stopPropagation(); closePanel(); });
  if (backdrop) backdrop.addEventListener("click", () => closePanel());
  if (sheetReset) sheetReset.addEventListener("click", (e) => { e.stopPropagation(); clearAllFilters(); });
  if (sheetApply) sheetApply.addEventListener("click", (e) => { e.stopPropagation(); closePanel(); });

  // Option toggles inside the popover. Stop propagation BEFORE the rebuild so the
  // document-level outside-click handler below never sees this click — otherwise
  // buildFilterPanel() replaces the option element, the click target detaches,
  // and panel.contains(detachedTarget) is false → the panel would wrongly close.
  // This keeps the popover open so you can pick several filters in one go.
  if (groups) groups.addEventListener("click", (e) => {
    const opt = e.target.closest(".filter-opt");
    if (!opt) return;
    e.stopPropagation();
    toggleFilterValue(opt.dataset.dim, opt.dataset.val);
  });

  if (clearBtn) clearBtn.addEventListener("click", (e) => { e.stopPropagation(); clearAllFilters(); });

  // Removing a chip clears that one selection.
  if (chipsWrap) chipsWrap.addEventListener("click", (e) => {
    const chip = e.target.closest(".active-filter-chip");
    if (!chip) return;
    toggleFilterValue(chip.dataset.dim, chip.dataset.val);
  });

  // Click outside / Escape closes the popover.
  document.addEventListener("click", (e) => {
    if (!panel || panel.style.display === "none") return;
    if (panel.contains(e.target) || (btn && btn.contains(e.target))) return;
    closePanel();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePanel(); });
}

// Does a student pass the active filters? `exceptKey` lets count-building ignore
// the dimension it's currently counting (so options aren't hidden by themselves).
function matchesYearbookScope(s, exceptKey) {
  for (const dim of FILTER_DIMENSIONS) {
    if (dim.key === exceptKey) continue;
    const sel = yearbookFilter[dim.key];
    if (sel.size === 0) continue;
    const vals = _studentValues(s, dim);
    if (!vals.some((v) => sel.has(v))) return false;
  }
  return true;
}

// Back-compat shim: the old cascading builder name is still called after data
// loads / on yearbook entry. Route it to the new popover builder.
function buildYearbookFilters() { buildFilterPanel(); }

// The old track-stats row was replaced by the Filter popover. Kept as a no-op
// so existing callers (applyDbPayload, switchMode, etc.) stay valid; the popover
// is rebuilt via buildFilterPanel() instead.
function renderStats() {}

function filterStudents(query) {
  currentSearchQuery = query.trim().toLowerCase();
  applyFilters();
}

function applyFilters(animate = true) {
  const filtered = STUDENTS.filter((s) => {
    // Active popover filters (University / Faculty / Department / Class / Track)
    if (!matchesYearbookScope(s)) return false;

    // Text search (name or track)
    if (currentSearchQuery) {
      const inName = s.name.toLowerCase().includes(currentSearchQuery);
      let inTrack = false;
      if (s.track) {
        const tracks = Array.isArray(s.track) ? s.track : [s.track];
        inTrack = tracks.some((t) => t.toLowerCase().includes(currentSearchQuery));
      }
      if (!inName && !inTrack) return false;
    }

    return true;
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

// Reflect the active scope in the Yearbook heading + subtitle. Each dimension
// is now a multi-select Set: show the single chosen value, "N selected" for
// several, or a sensible default when nothing is picked.
function updateYearbookHeading() {
  const titleEl = document.querySelector("#mode-yearbook .yearbook-title");
  const subEl = document.querySelector("#mode-yearbook .yearbook-subtitle");
  const pick = (key, fallback, singular) => {
    const set = yearbookFilter[key];
    if (!set || set.size === 0) return fallback;
    if (set.size === 1) return [...set][0];
    return `${set.size} ${singular}`;
  };
  if (titleEl) {
    // Keep the camera icon, replace only the trailing text node.
    const yrSet = yearbookFilter.classYear;
    let label;
    if (!yrSet || yrSet.size === 0) label = "All Classes";
    else if (yrSet.size === 1) label = `Class of ${[...yrSet][0]}`;
    else label = `${yrSet.size} Classes`;
    let textNode = [...titleEl.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
    if (textNode) textNode.textContent = " " + label;
    else titleEl.appendChild(document.createTextNode(" " + label));
  }
  if (subEl) {
    const parts = [
      pick("university", DEFAULT_UNIVERSITY, "universities"),
      pick("faculty", DEFAULT_FACULTY, "faculties"),
      pick("department", DEFAULT_DEPARTMENT, "departments"),
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
  renderHomeProjectTrackBreakdown();
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
  const ACR = new Set(["ai", "ic", "asic", "rf", "dsp", "os", "ui", "ux", "qa"]);
  // Tokens with a fixed mixed-case spelling that must be preserved verbatim.
  const MIXED = { iot: "IoT", devops: "DevOps", ios: "iOS" };
  return words
    .map((w) => {
      const lw = w.toLowerCase();
      if (MIXED[lw]) return MIXED[lw];
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

// Count GRADUATION PROJECTS per track (a project's OWN tracks, not its members')
// and render on Home, mirroring the students breakdown. A multi-track project is
// counted under each of its tracks. Hidden until projects load.
function renderHomeProjectTrackBreakdown() {
  const section = document.getElementById("homeProjectTracksSection");
  const grid = document.getElementById("homeProjectTrackGrid");
  if (!grid || !section) return;

  if (!GRADUATION_PROJECTS || GRADUATION_PROJECTS.length === 0) {
    section.style.display = "none";
    return;
  }

  const counts = {};
  GRADUATION_PROJECTS.forEach((p) => {
    const seen = new Set();
    projectTracks(p).forEach((t) => {
      const key = canonicalTrack(t);
      if (!key || seen.has(key)) return;
      seen.add(key);
      counts[key] = (counts[key] || 0) + 1;
    });
  });

  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (!entries.length) { section.style.display = "none"; return; }
  section.style.display = "";

  const sameSet = grid.childElementCount === entries.length &&
    entries.every(([t], i) => grid.children[i]?.dataset.track === t);
  if (!sameSet) {
    grid.innerHTML = entries.map(([track]) => `
      <div class="home-track-item" data-track="${track}">
        <span class="home-track-count">0</span>
        <span class="home-track-name">${track}</span>
      </div>`).join("");
  }
  entries.forEach(([, n], i) => {
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

// SVG icons per project *family*. Categories were broadened (e.g. "Digital IC
// Design", "Embedded Systems", "Networking"…), so we key the icons by a small
// set of families and resolve any category to one of them via categoryFamily().
// This way every project gets an icon + colour, not just the original three.
const PROJ_ICONS = {
  digital: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3"/></svg>`,
  embedded: `<img src="icons/embedded_icon.png" alt="Embedded" class="proj-card-img-icon" />`,
  network: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
  ai: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="6" height="6" rx="1"/><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2"/></svg>`,
  robotics: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="8" width="14" height="11" rx="2"/><path d="M12 8V5M12 5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM2 13v2M22 13v2"/><circle cx="9" cy="13" r="1"/><circle cx="15" cy="13" r="1"/></svg>`,
  control: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>`,
  comms: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4.93 19.07A10 10 0 0 1 4.93 4.93M19.07 4.93a10 10 0 0 1 0 14.14M7.76 16.24a6 6 0 0 1 0-8.49M16.24 7.76a6 6 0 0 1 0 8.49"/><circle cx="12" cy="12" r="2"/></svg>`,
  signal: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12c1.5 0 1.5-7 3-7s1.5 14 3 14 1.5-9 3-9 1.5 5 3 5 1.5-3 3-3 1.5 2 3 2"/></svg>`,
  rf: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="20" x2="12" y2="11"/><path d="M5 11l7-8 7 8"/><circle cx="12" cy="20" r="1"/><path d="M8 11h8"/></svg>`,
  power: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
  biomedical: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l2 5 4-10 2 5h6"/></svg>`,
  security: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  software: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,
};

// Map a free-text category (new or legacy) onto one of the icon families above.
// Keyword-based so "Digital IC Design", "ASIC Verification" → digital, etc.
function categoryFamily(category) {
  const c = String(category || "").toLowerCase();
  if (/embedded|firmware|iot|microcontroller|rtos/.test(c)) return "embedded";
  if (/digital|asic|fpga|verilog|vlsi|ic design/.test(c)) return "digital";
  if (/network|cloud|web|backend|frontend|full.?stack|software|devops|mobile|app/.test(c)) {
    return /network/.test(c) ? "network" : "software";
  }
  if (/security|cyber|crypto/.test(c)) return "security";
  if (/\bai\b|artificial|machine learning|deep learning|\bml\b|computer vision|\bnlp\b|neural/.test(c)) return "ai";
  if (/robot|automation|mechatron/.test(c)) return "robotics";
  if (/control|plc|scada/.test(c)) return "control";
  if (/communication|comms|wireless|5g|telecom/.test(c)) return "comms";
  if (/signal|dsp|audio|image proc/.test(c)) return "signal";
  if (/\brf\b|antenna|microwave|radar/.test(c)) return "rf";
  if (/power|energy|electronics|grid|battery|renewable/.test(c)) return "power";
  if (/bio|medical|health|ecg|eeg/.test(c)) return "biomedical";
  return "digital"; // sensible default so a card never renders without an icon
}

// The icon HTML + the family class for a given category (used by both the
// Projects grid and the profile's Graduation Project tab so they always match).
function categoryIcon(category) {
  const fam = categoryFamily(category);
  return { html: PROJ_ICONS[fam] || PROJ_ICONS.digital, family: fam };
}

// Display labels for category badges
const CAT_LABELS = {
  Digital: "Digital Design",
  Embedded: "Embedded Systems",
  Network: "Network",
};

// The category tabs were removed in favour of the Filter (Track / University /
// …) popover, so currentProjectCat stays "All" and category filtering now lives
// in the Track dimension. Kept as a thin helper for any remaining callers
// (e.g. openProjectFromId resetting the view) — it no longer touches the DOM.
function switchProjectCat(cat) {
  currentProjectCat = cat;
  renderProjects();
}

function renderProjects(animate = true) {
  const grid = document.getElementById("projectsGrid");
  if (!grid) return;
  // Returning from a member's card/profile (history replay) must NOT replay the
  // entrance animation — the grid should stay put, like the yearbook.
  grid.classList.toggle("no-anim", !animate);

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // Combine the category tab + the text search + the dimension filters
  // (University / Faculty / Department / Class / Track), then sort by leader.
  const filtered = GRADUATION_PROJECTS
    .filter((p) => currentProjectCat === "All" || p.category === currentProjectCat)
    .filter((p) => matchesProjectScope(p))
    .filter((p) => matchesProjectSearch(p))
    .sort((a, b) => {
      const aLeader = (a.team || []).find(m => m.leader);
      const bLeader = (b.team || []).find(m => m.leader);
      const aName = aLeader ? aLeader.name : "";
      const bName = bLeader ? bLeader.name : "";
      return aName.localeCompare(bName);
    });

  if (filtered.length === 0) {
    grid.innerHTML =
      '<p class="no-projects">No projects match your search or filters.</p>';
    return;
  }

  grid.innerHTML = "";

  filtered.forEach((project, idx) => {
    // Per-project key so "All" view colours each card by its own category. The
    // family (digital/embedded/…) drives both the colour and the icon, so any
    // category — old or newly added — still gets a styled icon top-right.
    const catKey = categoryFamily(project.category);
    const card = document.createElement("div");
    card.className = `project-card cat-${catKey}`;
    card.style.animationDelay = `${idx * 0.1}s`;
    if (project._key) card.dataset.projKey = project._key;

    // ── Card Top: badge + icon ──
    const cardTop = document.createElement("div");
    cardTop.className = "project-card-top";
    const iconSvg = categoryIcon(project.category).html;
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
      nameSpan.textContent = member.name;
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

    // ── Track badges (project's own tracks: primary first, then sub-tracks) ──
    const tracks = projectTracks(project);
    let tracksEl = null;
    if (tracks.length) {
      tracksEl = document.createElement("div");
      tracksEl.className = "project-tracks";
      tracksEl.innerHTML = tracks
        .map((t, i) =>
          `<span class="project-track-chip${i === 0 ? " is-primary" : ""}">${esc(t)}</span>`
        )
        .join("");
    }

    card.appendChild(cardTop);
    if (tracksEl) card.appendChild(tracksEl);
    card.appendChild(comingSoonEl);
    card.appendChild(teamSection);

    grid.appendChild(card);
  });

  updateProjectDiscussionCountdowns();
}

// ===== GP Projects filtering (search + University/Faculty/Department/Class/Track) =====
// Mirrors the Yearbook filter UX. Each project derives its hierarchy fields from
// its own metadata; when a field is missing we fall back to the team leader's
// (then any member's) yearbook record, so older project records still filter.
let currentProjectSearch = "";
const projectFilter = {
  university: new Set(),
  faculty: new Set(),
  department: new Set(),
  classYear: new Set(),
  track: new Set(),
};

function _projTeam(p) {
  return Array.isArray(p.team) ? p.team : Object.values(p.team || {});
}

// Every value a project contributes to a dimension — derived ONLY from the
// project's own metadata, never from its members. A graduation project belongs
// to exactly one track (the track the PROJECT is about); if a Communications
// student joins an Embedded project, the project still filters as Embedded only.
// Hierarchy fields fall back to the cohort defaults so legacy records still
// filter. Used for BOTH matching and the filter-panel option list, so what the
// panel offers and what it matches are always identical.
function _projectValues(p, dim) {
  if (dim.key === "track") {
    // ALL of the project's own tracks (primary + sub). Filtering by any one of
    // them surfaces the project, so a multi-track project appears under each of
    // its tracks.
    return projectTracks(p);
  }
  const v = p[dim.field] || dim.fallback();
  return v ? [v] : [];
}

// The filter panel and matching share the same project-only value source so the
// options shown always correspond to projects that actually match.
const _projectValuesForDisplay = _projectValues;

function matchesProjectScope(p, exceptKey) {
  for (const dim of FILTER_DIMENSIONS) {
    if (dim.key === exceptKey) continue;
    const sel = projectFilter[dim.key];
    if (sel.size === 0) continue;
    const vals = _projectValues(p, dim);
    if (!vals.some((v) => sel.has(v))) return false;
  }
  return true;
}

// Search matches project name, ANY team member's name, the team name and the
// supervisor — case-insensitive, English/Arabic alike.
function matchesProjectSearch(p) {
  const q = currentProjectSearch;
  if (!q) return true;
  const hay = [
    p.name, p.title, p.category, p.teamName, p.team_name, p.supervisor,
    ..._projTeam(p).map((m) => m.name),
  ].filter(Boolean).join(" ").toLowerCase();
  return hay.includes(q);
}

function filterProjectsSearch(query) {
  currentProjectSearch = String(query || "").trim().toLowerCase();
  renderProjects();
}

function _projCountsForDimension(dim) {
  const counts = new Map();
  (GRADUATION_PROJECTS || []).forEach((p) => {
    if (currentProjectCat !== "All" && p.category !== currentProjectCat) return;
    if (!matchesProjectScope(p, dim.key)) return;
    // Use display values (project's own tracks only) so the panel doesn't show
    // tracks that only exist in a team member's yearbook profile.
    _projectValuesForDisplay(p, dim).forEach((v) => counts.set(v, (counts.get(v) || 0) + 1));
  });
  return counts;
}

function buildProjectFilterPanel() {
  const groupsWrap = document.getElementById("projFilterGroups");
  if (!groupsWrap) return;

  // Drop selections that no longer exist in the data (project may have been removed).
  FILTER_DIMENSIONS.forEach((dim) => {
    const present = new Set();
    (GRADUATION_PROJECTS || []).forEach((p) => _projectValues(p, dim).forEach((v) => present.add(v)));
    projectFilter[dim.key].forEach((v) => { if (!present.has(v)) projectFilter[dim.key].delete(v); });
  });

  const html = FILTER_DIMENSIONS.map((dim) => {
    const counts = _projCountsForDimension(dim);
    const selected = projectFilter[dim.key];
    // Only show values that either have projects behind them (count > 0)
    // OR are currently selected (so user can deselect them).
    // Counts are built from _projectValuesForDisplay (project's own track only)
    // so no phantom tracks from team members' yearbook profiles appear here.
    const values = _sortFilterValues(
      dim.key,
      new Set([...counts.keys(), ...selected])
    ).filter((v) => (counts.get(v) || 0) > 0 || selected.has(v));

    // Hide the entire group if there are no options at all.
    if (values.length === 0) return "";

    const opts = values.map((v) => {
      const n = counts.get(v) || 0;
      const isOn = selected.has(v);
      const esc = (x) => String(x).replace(/"/g, "&quot;");
      return `<button type="button" class="filter-opt${isOn ? " is-on" : ""}" role="checkbox" aria-checked="${isOn}"
        data-dim="${dim.key}" data-val="${esc(v)}">
        <span class="filter-opt-check" aria-hidden="true"></span>
        <span class="filter-opt-label">${esc(v)}</span>
        <span class="filter-opt-count">${n}</span>
      </button>`;
    }).join("");
    return `<div class="filter-group" data-dim="${dim.key}">
      <div class="filter-group-title">${dim.label}</div>
      <div class="filter-opts">${opts}</div>
    </div>`;
  }).join("");

  groupsWrap.innerHTML = html || `<p class="filter-empty">No filters available yet.</p>`;
  _updateProjFilterButtonCount();
  _renderProjActiveChips();
}

function _projActiveFilterCount() {
  return FILTER_DIMENSIONS.reduce((n, dim) => n + projectFilter[dim.key].size, 0);
}
function _updateProjFilterButtonCount() {
  const badge = document.getElementById("projFilterCount");
  const btn = document.getElementById("projFilterToggleBtn");
  if (!badge) return;
  const n = _projActiveFilterCount();
  badge.textContent = n;
  badge.style.display = n ? "" : "none";
  if (btn) btn.classList.toggle("has-active", n > 0);
}
function _renderProjActiveChips() {
  const wrap = document.getElementById("projActiveFilters");
  if (!wrap) return;
  const chips = [];
  FILTER_DIMENSIONS.forEach((dim) => {
    projectFilter[dim.key].forEach((v) => {
      const esc = (x) => String(x).replace(/"/g, "&quot;");
      chips.push(`<button type="button" class="active-filter-chip" data-dim="${dim.key}" data-val="${esc(v)}">
        ${esc(v)} <span class="active-filter-x" aria-hidden="true">×</span>
      </button>`);
    });
  });
  wrap.innerHTML = chips.join("");
  wrap.style.display = chips.length ? "" : "none";
}
function toggleProjectFilterValue(dimKey, val) {
  const set = projectFilter[dimKey];
  if (set.has(val)) set.delete(val); else set.add(val);
  buildProjectFilterPanel();
  renderProjects();
}
function clearAllProjectFilters() {
  FILTER_DIMENSIONS.forEach((dim) => projectFilter[dim.key].clear());
  buildProjectFilterPanel();
  renderProjects();
}

// Wire the project Filter button, popover/bottom-sheet and option/chip clicks.
function initProjectFilters() {
  const btn = document.getElementById("projFilterToggleBtn");
  const panel = document.getElementById("projFilterPanel");
  const groups = document.getElementById("projFilterGroups");
  const clearBtn = document.getElementById("projFilterClearBtn");
  const chipsWrap = document.getElementById("projActiveFilters");
  const backdrop = document.getElementById("filterSheetBackdrop");
  const sheetClose = document.getElementById("projFilterSheetClose");
  const sheetReset = document.getElementById("projFilterSheetReset");
  const sheetApply = document.getElementById("projFilterSheetApply");
  if (!panel) return;

  const isSheet = () => window.matchMedia("(max-width: 700px)").matches;
  const homeParent = panel.parentNode;
  const openPanel = () => {
    if (isSheet()) {
      document.body.appendChild(panel);           // escape .container's stacking context
      if (backdrop) backdrop.hidden = false;
      document.body.classList.add("filter-sheet-open");
    }
    panel.style.display = "";
    if (btn) btn.setAttribute("aria-expanded", "true");
  };
  const closePanel = () => {
    panel.style.display = "none";
    if (btn) btn.setAttribute("aria-expanded", "false");
    if (backdrop) backdrop.hidden = true;
    document.body.classList.remove("filter-sheet-open");
    if (homeParent && panel.parentNode !== homeParent) homeParent.appendChild(panel);
  };

  if (btn) btn.addEventListener("click", (e) => {
    e.stopPropagation();
    (panel.style.display === "none") ? openPanel() : closePanel();
  });
  if (sheetClose) sheetClose.addEventListener("click", (e) => { e.stopPropagation(); closePanel(); });
  if (sheetReset) sheetReset.addEventListener("click", (e) => { e.stopPropagation(); clearAllProjectFilters(); });
  if (sheetApply) sheetApply.addEventListener("click", (e) => { e.stopPropagation(); closePanel(); });
  // The shared backdrop is dismissed by the yearbook handler too; add ours so it
  // works regardless of which panel opened it.
  if (backdrop) backdrop.addEventListener("click", () => closePanel());

  if (groups) groups.addEventListener("click", (e) => {
    const opt = e.target.closest(".filter-opt");
    if (!opt) return;
    e.stopPropagation();
    toggleProjectFilterValue(opt.dataset.dim, opt.dataset.val);
  });
  if (clearBtn) clearBtn.addEventListener("click", (e) => { e.stopPropagation(); clearAllProjectFilters(); });
  if (chipsWrap) chipsWrap.addEventListener("click", (e) => {
    const chip = e.target.closest(".active-filter-chip");
    if (!chip) return;
    toggleProjectFilterValue(chip.dataset.dim, chip.dataset.val);
  });
  document.addEventListener("click", (e) => {
    if (panel.style.display === "none") return;
    if (panel.contains(e.target) || (btn && btn.contains(e.target))) return;
    closePanel();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePanel(); });
}

// ── Project deep-linking ──
// A project is addressed by its Firebase key in the URL (/project/<key>).
// openProjectFromId scrolls the Projects grid to that project's card and gives
// it a brief highlight, so a refresh / shared link lands on the right project.
function projectId(project) { return project && (project._key || ""); }

function openProjectFromId(id) {
  if (!id) return false;
  const proj = (GRADUATION_PROJECTS || []).find((p) => (p._key || "") === id);
  if (!proj) return false;
  if (currentMode !== "projects") return false; // grid not rendered yet
  // The category tab must include this project for its card to exist.
  if (currentProjectCat !== "All" && proj.category !== currentProjectCat) {
    switchProjectCat("All");
  }
  const grid = document.getElementById("projectsGrid");
  if (!grid) return false;
  // Find the card by matching the leader name (cards are rendered in order).
  const card = grid.querySelector(`[data-proj-key="${CSS.escape(id)}"]`);
  if (!card) return false;
  card.scrollIntoView({ behavior: "auto", block: "center" });
  card.classList.add("project-card-highlight");
  setTimeout(() => card.classList.remove("project-card-highlight"), 2400);
  return true;
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
  initProjectFilters();
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
    // Resolve the target mode from the URL first (survives state loss on refresh),
    // falling back to the history state, then home.
    const urlMode = pathToMode();
    const mode = urlMode || (e.state && e.state.mode) || "home";

    // Landing on a /profile/<id>[/edit] entry (e.g. Back from another section, or
    // Forward into the inline editor). Rebuild the same full-page profile.
    if (mode === "profile") {
      // Leaving any open edit form that lived in submit mode.
      if (typeof window.__hideEditForm === "function") window.__hideEditForm();
      const urlId = profileIdFromPath();
      _fpEditing = /\/edit\/?$/.test(location.pathname);
      let s = (urlId && findStudentById(urlId)) || null;
      if (!s) {
        let key = (e.state && e.state.student) || null;
        if (!key) { try { key = (JSON.parse(sessionStorage.getItem("eece-open-profile") || "null") || {}).student; } catch (_) {} }
        s = key && typeof findStudentByKey === "function" ? findStudentByKey(key) : null;
      }
      if (s && typeof openFullProfile === "function") {
        openFullProfile(s, { fromHistory: true });
      } else if (urlId) {
        // Data not loaded yet (cold Back) → stash so applyDbPayload reopens it.
        _pendingProfileId = urlId;
        _pendingEditAfterOpen = _fpEditing;
      }
      return;
    }

    // Any other mode: tear down the profile page if it was open, then replay.
    if (typeof closeFullProfile === "function") closeFullProfile();

    // Closing an overlay (quick card / full profile) → we have a saved scroll
    // position to restore so the user lands back on the same card. switchMode
    // re-renders the grid and forces scroll to the top, so re-apply our saved
    // position over the next few frames (the grid's lazy images can shift the
    // page height after the first paint, which would otherwise lose the spot).
    const restoreScroll = _overlayReturnScroll;
    switchMode(mode, true); // replay without pushing a new entry
    if (restoreScroll != null) {
      _restoreScrollRobust(restoreScroll);
      _overlayReturnScroll = null;
    }
  });

  // Land on the right view for the current URL (seed the first history entry).
  //
  // The URL is the source of truth:
  //   /profile/<id>[/edit] → reconstruct that exact profile from the id, even
  //                          on a cold refresh or a shared deep link.
  //   /project/<id>        → open the projects section + that project's card.
  //   /student             → transient quick-card overlay; needs a live student
  //                          object we don't have cold, so it falls back to the
  //                          yearbook section underneath.
  const rawPath = (location.pathname || "/").replace(/^\/+|\/+$/g, "");
  const urlProfileId = profileIdFromPath();          // set on /profile/<id>[/edit]
  const isProfilePath = !!urlProfileId;
  const isEditPath = isProfilePath && /\/edit$/.test(rawPath);
  const projMatch = rawPath.match(/^project\/([^/]+)$/);
  const urlProjectId = projMatch ? decodeURIComponent(projMatch[1]) : null;

  // The section the overlay sits on. Remembered across the refresh so closing
  // the overlay returns there; defaults to yearbook for profiles, projects for
  // a project deep link.
  let savedProfile = null;
  if (isProfilePath) {
    try { savedProfile = JSON.parse(sessionStorage.getItem("eece-open-profile") || "null"); } catch (_) {}
  }

  // A profile sits ON TOP of a real section. The base must be a section the user
  // can land on via Back — never "profile" itself (that would make the profile
  // its own base, leaving nothing underneath, so Back exits the site) and never
  // a transient overlay ("student") or portal page. Anything else falls back to
  // the yearbook so there is always a section beneath the profile entry.
  const BASE_SECTIONS = ["home", "countdown", "yearbook", "projects"];
  let startMode;
  if (isProfilePath) {
    startMode = (savedProfile && BASE_SECTIONS.includes(savedProfile.from)) ? savedProfile.from : "yearbook";
  } else if (urlProjectId) {
    startMode = "projects";
  } else if (rawPath === "student") {
    startMode = "yearbook";
  } else {
    startMode = pathToMode();
  }
  // Seed the base section as the FIRST history entry (so Back from the overlay
  // lands on the section, and Back from the section leaves the site cleanly).
  history.replaceState({ mode: startMode }, "", modeToPath(startMode));
  switchMode(startMode, true);

  // Reopen the profile addressed by the URL. Resolve the id against the current
  // data; if the student isn't loaded yet (cold network), stash the id so
  // fetchFirebaseData reopens it the moment fresh data arrives.
  if (isProfilePath) {
    _pendingEditAfterOpen = isEditPath;
    // Cold-load on /profile/<id>[/edit]: push the profile entry on top of the
    // seeded section, and open in edit mode if the URL ends in /edit AND the
    // viewer owns it (owner check happens after auth resolves; until then we
    // render read-only and refreshOpenProfileAuth re-renders with edit if owned).
    const reopen = () => {
      const s = findStudentById(urlProfileId) ||
                (savedProfile && savedProfile.student ? findStudentByKey(savedProfile.student) : null);
      if (s && typeof openFullProfile === "function") {
        _fpEditing = isEditPath; // editor shows once auth confirms ownership
        openFullProfile(s);
        _pendingProfileKey = null;
        _pendingProfileId = null;
        return true;
      }
      return false;
    };
    if (!reopen()) { _pendingProfileId = urlProfileId; _pendingProfileKey = savedProfile && savedProfile.student; }
  } else if (urlProjectId) {
    _pendingProjectId = urlProjectId;
    // Cards render synchronously inside switchMode("projects") above, but the
    // data may still be loading — try now, and applyDbPayload retries on arrival.
    requestAnimationFrame(() => {
      if (_pendingProjectId && openProjectFromId(_pendingProjectId)) _pendingProjectId = null;
    });
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
const VALID_MODES = ["home", "countdown", "yearbook", "projects", "submit", "admin", "profile"];

// `profile` is a full-page view (like yearbook/projects), not an overlay. Its URL
// carries the student id and an optional /edit suffix, both derived from the
// currently-open profile + edit state so Back/Forward and refresh stay correct.
function modeToPath(mode) {
  if (mode === "home") return "/";
  if (mode === "profile") {
    const id = (typeof _openProfileStudent !== "undefined" && _openProfileStudent)
      ? profileId(_openProfileStudent) : "";
    if (!id) return "/yearbook";
    return _fpEditing ? `/profile/${id}/edit` : `/profile/${id}`;
  }
  return `/${mode}`;
}

// Back button for the portal pages (submit / edit / admin). Steps ONE entry back
// through the browser history so navigation is symmetric — pressing Back retraces
// exactly the path the user took to get here (e.g. edit → my profile → their card
// → yearbook), one step at a time, instead of jumping to a fixed section. Falls
// back to home only when there's no in-app history to step back into (e.g. the
// user deep-linked straight onto /submit in a fresh tab).
function goBackFromPortal() {
  // The very first history entry we seed has `_seed: true` in initial routing; if
  // we're already at the bottom of the stack, history.back() would leave the site,
  // so route home instead. Otherwise step back and let popstate replay the view.
  if (window.history.length > 1) {
    history.back();
  } else {
    switchMode("home");
  }
}
window.goBackFromPortal = goBackFromPortal;

// Resolve the current location (or a given path) to a real mode, falling back
// to "home" for the root and anything unrecognised.
function pathToMode(pathname = location.pathname) {
  const seg = (pathname || "/").replace(/^\/+|\/+$/g, "");
  if (!seg) return "home";
  if (/^profile\//.test(seg)) return "profile";
  // /student is a transient quick-card overlay with no live student object on a
  // cold Back. It sits on top of the yearbook, so resolve it to the yearbook
  // section (returning home would drop the user to the top of the site).
  if (seg === "student") return "yearbook";
  return VALID_MODES.includes(seg) ? seg : "home";
}

// The approvals page (/admin) is admin-only. Non-admins must not even reach it
// by typing the URL. We can only decide once auth has resolved (body.auth-ready);
// before that we let it through and re-check when onAuthStateChanged settles
// (portal.js calls enforceAdminRoute() after it resolves). Returns true if the
// route was blocked (caller should stop).
function isAdminRouteBlocked(mode) {
  if (mode !== "admin") return false;
  const resolved = document.body.classList.contains("auth-ready");
  return resolved && !window.__isAdmin;
}
function enforceAdminRoute() {
  if (currentMode === "admin" && isAdminRouteBlocked("admin")) {
    switchMode("home");
  }
}
window.enforceAdminRoute = enforceAdminRoute;

function switchMode(mode, fromHistory = false) {
  // Guard the admin/approvals route: a signed-out or non-admin visitor who types
  // /admin (or hits Back into it) is bounced home instead of seeing the page.
  if (isAdminRouteBlocked(mode)) {
    if (location.pathname.replace(/^\/+|\/+$/g, "") === "admin") {
      try { history.replaceState({ mode: "home" }, "", "/"); } catch (_) {}
    }
    mode = "home";
    fromHistory = true; // we've already fixed the URL; don't push another entry
  }

  const prevMode = currentMode;
  currentMode = mode;
  // Expose active mode so the portal module can react (e.g. refresh approvals).
  document.body.dataset.mode = mode;

  // Leaving the profile page for a different section → drop edit state + the
  // remembered student so we don't re-open it. (Navigating profile→profile, e.g.
  // one member to another, keeps going through openFullProfile which manages it.)
  if (mode !== "profile" && prevMode === "profile") {
    _fpEditing = false;
    _openProfileStudent = null;
  }

  // Push a history entry so the browser Back button / backspace returns to the
  // previous view instead of leaving the site. popstate replays without pushing.
  // Clean path-based URLs (e.g. /yearbook); Home lives at the root "/". The
  // profile carries its id in the path; an edit↔view toggle is a same-mode URL
  // change, so push when the PATH changes too (not just when the mode changes).
  if (!fromHistory && (prevMode !== mode || (mode === "profile" && location.pathname !== modeToPath(mode)))) {
    try { history.pushState({ mode }, "", modeToPath(mode)); } catch (_) {}
  }

  // Always close the mobile nav drawer when navigating.
  closeNavMenu();

  // Portal pages + the profile page take over the screen: hide the top nav chrome.
  const isPortal = PORTAL_MODES.includes(mode) || mode === "profile";
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
    profile: document.getElementById("fullProfile"),
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
        FILTER_DIMENSIONS.forEach((dim) => yearbookFilter[dim.key].clear());
        buildFilterPanel();
      }
      // Returning via Back/Forward (from a card or profile) → no entrance
      // animation. Fresh entry from another section → animate the grid in.
      applyFilters(!fromHistory);
    } else if (mode === "projects") {
      sections.projects.style.display = "block";
      // Fresh entry from another section → start clean (clear search + filters).
      // Back/Forward (returning from a project's member profile) keeps the search,
      // filters and category so the user lands exactly where they left off.
      if (!fromHistory && prevMode !== "projects") {
        const ps = document.getElementById("projectSearch");
        if (ps) ps.value = "";
        currentProjectSearch = "";
        FILTER_DIMENSIONS.forEach((dim) => projectFilter[dim.key].clear());
      }
      buildProjectFilterPanel();
      // Fresh entry → animate the grid in; Back/Forward (returning from a card)
      // → no animation, so it doesn't look like you're "entering" again.
      renderProjects(!fromHistory);
    } else if (mode === "submit" && sections.submit) {
      sections.submit.style.display = "block";
    } else if (mode === "admin" && sections.admin) {
      sections.admin.style.display = "block";
    } else if (mode === "profile" && sections.profile) {
      // The DOM is populated by openFullProfile() before it calls switchMode().
      sections.profile.style.display = "block";
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
      tag: "Class of 2026",
    },
    discussion: {
      icon: "🏆",
      badge: "DONE!",
      title: "Congratulations!",
      en: "Project Discussion is officially complete.",
      tag: "Class of 2026",
    },
    party: {
      icon: "🥳",
      badge: "GRADUATED!",
      title: "Happy Graduation!",
      en: "This is YOUR day. You earned every second of it.",
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
