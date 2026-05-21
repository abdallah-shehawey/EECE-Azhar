// ===== Scroll Restoration Fix =====
// Always start from top on page load/refresh
if ("scrollRestoration" in history) history.scrollRestoration = "manual";

// ===== Target Dates =====
const EVENTS = {
  exam: {
    label: "Final Exam",
    date: new Date("2026-06-03T13:00:00"), // End time is 1:00 PM
  },
  discussion: {
    label: "Project Discussion",
    date: new Date("2026-07-01T10:00:00"),
  },
  party: {
    label: "Graduation Party",
    date: new Date("2026-07-22T10:00:00"),
  },
};

// ===== Students Data =====
// Loaded from data/students.js

// ===== Cloudflare Photos Backend =====
// Replace this with your Cloudflare R2 bucket public URL
const CLOUDFLARE_BASE_URL = "https://pub-ce440e8089f54fd1b94098e019b0b3dd.r2.dev";
const CLOUDFLARE_IMAGE_EXT = ".jpg"; // e.g. .jpg, .png, .webp

async function loadDrivePhotos() {
  // Directly patch every student's photo field with the Cloudflare URL.
  STUDENTS.forEach((s) => {
    if (s.photo) {
      let key = s.photo.trim();
      // If you added the extension in students.js (e.g. "Islam.webp"), use it directly.
      // Otherwise, fallback to trying .jpg then .jpeg then .webp
      if (!key.includes('.')) {
        key += '.jpg';
      }
      s.photo = `${CLOUDFLARE_BASE_URL}/${key}`;
    }
  });
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

function openPhotoModal(student) {
  let modal = document.getElementById("photoModal");

  if (!modal) {
    modal = document.createElement("div");
    modal.id = "photoModal";
    modal.className = "photo-modal";

    modal.closeModal = (fromPopState = false) => {
      modal.classList.remove("active");
      setTimeout(() => (modal.style.display = "none"), 300);
      if (!fromPopState && window.location.hash === "#student") {
        history.back();
      }
    };

    modal.addEventListener("click", (e) => {
      if (e.target === modal || e.target.className === "photo-modal-close") {
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
      if (
        modal.style.display === "flex" &&
        window.location.hash !== "#student"
      ) {
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

  modal.innerHTML = `
        <span class="photo-modal-close">&times;</span>
        <div class="photo-modal-content">
            ${photoHtml}
            <h3>${student.name}</h3>
            ${leaderBadgeHtml}
            ${tracksHtml}
            ${socialHtml}
        </div>
    `;

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
  if (window.location.hash !== "#student") {
    history.pushState(null, "", "#student");
  }
}

function openContactModal() {
  const devInfo = {
    name: "Abdallah Shehawey",
    photo: `${CLOUDFLARE_BASE_URL}/abdallahshehawey${CLOUDFLARE_IMAGE_EXT}`,
    track: ["Embedded Systems", "Embedded Linux", "DevOps"],
    color: "linear-gradient(135deg, #8b5cf6, #6d28d9)",
    social: {
      linkedin: "https://www.linkedin.com/in/abdallah-shehawey",
      github: "https://github.com/abdallah-shehawey",
      whatsapp: "+201501899476",
      facebook: "https://www.facebook.com/share/1BHxWsiLCE/",
      email: "shehawey9@gmail.com",
    },
  };
  openPhotoModal(devInfo);
}

function renderYearbook(list = STUDENTS) {
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
    card.style.animation = "fadeInUp 0.5s ease-out both";
    card.style.animationDelay = `${(i % 10) * 0.06}s`; // cycle delay so it doesn't get too long

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
      // Show avatar placeholder first, then swap to real image once loaded
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

      let retryCount = 0;
      let cancelled = false; // guard against stale timers after grid clear
      const MAX_RETRIES = 3;
      const RETRY_DELAYS = [2000, 4000, 8000]; // ms

      // Cancel pending retries when the card is removed from DOM
      const observer = new MutationObserver(() => {
        if (!document.contains(card)) {
          cancelled = true;
          observer.disconnect();
        }
      });
      observer.observe(
        document.getElementById("studentsGrid") || document.body,
        { childList: true },
      );

      function tryLoad() {
        if (cancelled) return;
        let url = student.photo;
        if (retryCount === 1) {
          url = url.replace(/\.jpg$/i, '.jpeg'); // Try .jpeg on first retry
        } else if (retryCount === 2) {
          url = url.replace(/\.jpg$/i, '.webp'); // Try .webp on second retry
        } else if (retryCount > 2) {
          const sep = url.includes("?") ? "&" : "?";
          url = url.replace(/\.jpg$/i, '.webp') + sep + "_r=" + retryCount;
        }
        // Set handlers BEFORE src — prevents race with cached images firing onload immediately
        img.onload = () => {
          if (cancelled) return;
          img.style.display = "";
          if (photoWrap.contains(av)) photoWrap.replaceChild(img, av);
          observer.disconnect();
        };
        img.onerror = () => {
          if (cancelled) return;
          if (retryCount < MAX_RETRIES) {
            setTimeout(() => {
              retryCount++;
              tryLoad();
            }, RETRY_DELAYS[retryCount] || 8000);
          }
          // else: keep showing avatar silently
        };
        img.src = url; // set src last — handlers already in place
      }
      tryLoad();

      photoWrap.appendChild(img);
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
    if (trackContainer.children.length > 0) card.appendChild(trackContainer);
    if (socialRow.children.length > 0) card.appendChild(socialRow);

    grid.appendChild(card);
  });
}

let selectedCategories = new Set();
let currentSearchQuery = "";

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

  let trackCounts = {};

  STUDENTS.forEach((s) => {
    const cats = getStudentCategories(s);
    cats.forEach((cat) => {
      trackCounts[cat] = (trackCounts[cat] || 0) + 1;
    });
  });

  const statsData = [
    { category: "All", label: "Students", count: STUDENTS.length },
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
        <div class="stat-item ${isActive ? "active-filter" : ""}" data-category="${stat.category}" onclick="toggleCategoryFilter('${stat.category}')">
            <span class="stat-number" data-target="${stat.count}">0</span>
            <span class="stat-label">${stat.label}</span>
        </div>
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
    if (itemCat === "All") {
      item.classList.toggle("active-filter", selectedCategories.size === 0);
    } else {
      item.classList.toggle("active-filter", selectedCategories.has(itemCat));
    }
  });

  applyFilters();
}

function filterStudents(query) {
  currentSearchQuery = query.trim().toLowerCase();
  applyFilters();
}

function applyFilters() {
  const filtered = STUDENTS.filter((s) => {
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

  renderYearbook(filtered);
}

// ===== Graduation Projects Data =====
// Loaded from data/projects.js

let currentProjectCat = "Digital";

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

  const filtered = GRADUATION_PROJECTS.filter(
    (p) => p.category === currentProjectCat,
  );

  if (filtered.length === 0) {
    grid.innerHTML =
      '<p class="no-projects">No projects found in this category.</p>';
    return;
  }

  grid.innerHTML = "";
  const catKey = currentProjectCat.toLowerCase();

  filtered.forEach((project, idx) => {
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

    project.team.forEach((member) => {
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

      // Avatar — show initials first, swap to photo when loaded
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

        let retryCount = 0;
        let cancelled = false;
        const MAX_RETRIES = 3;
        const RETRY_DELAYS = [2000, 4000, 8000];

        const grid = document.getElementById("projectsGrid");
        const obs = new MutationObserver(() => {
          if (!document.contains(pill)) {
            cancelled = true;
            obs.disconnect();
          }
        });
        if (grid) obs.observe(grid, { childList: true });

        function tryLoadMember() {
          if (cancelled) return;
          let url = student.photo;
          if (retryCount === 1) {
            url = url.replace(/\.jpg$/i, '.jpeg'); // Try .jpeg on first retry
          } else if (retryCount === 2) {
            url = url.replace(/\.jpg$/i, '.webp'); // Try .webp on second retry
          } else if (retryCount > 2) {
            const sep = url.includes("?") ? "&" : "?";
            url = url.replace(/\.jpg$/i, '.webp') + sep + "_r=" + retryCount;
          }
          // Set handlers BEFORE src — prevents race with cached images firing onload immediately
          img.onload = () => {
            if (cancelled) return;
            img.style.display = "";
            if (pill.contains(fb)) pill.replaceChild(img, fb);
            obs.disconnect();
          };
          img.onerror = () => {
            if (cancelled) return;
            if (retryCount < MAX_RETRIES) {
              setTimeout(() => {
                retryCount++;
                tryLoadMember();
              }, RETRY_DELAYS[retryCount] || 8000);
            }
          };
          img.src = url; // set src last — handlers already in place
        }
        tryLoadMember();
        pill.appendChild(img);
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

// ===== Swipe Gesture (Mode Switching) =====
const MODES = ["countdown", "yearbook", "projects"];

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


// ===== Initialize =====
document.addEventListener("DOMContentLoaded", async () => {
  window.scrollTo(0, 0);
  document.body.classList.add("mode-countdown-active");
  startCountdown();
  startProjectDiscussionCountdown();
  updateLocalTime();
  initAudio();
  // Load Drive photos first, then render yearbook with real URLs
  await loadDrivePhotos();
  applyFilters();
  initSwipeGesture();
});

// ===== Mode Switching (Top-Level) =====
function switchMode(mode) {
  currentMode = mode;

  // Update mode buttons
  document
    .querySelectorAll(".mode-btn")
    .forEach((btn) => btn.classList.remove("active"));
  document.querySelector(`[data-mode="${mode}"]`).classList.add("active");

  // Show/hide sections
  const countdownEl = document.getElementById("mode-countdown");
  const yearbookEl = document.getElementById("mode-yearbook");
  const projectsEl = document.getElementById("mode-projects");

  countdownEl.style.display = "none";
  yearbookEl.style.display = "none";
  projectsEl.style.display = "none";

  if (mode === "countdown") {
    document.body.classList.add("mode-countdown-active");
    window.scrollTo(0, 0);
    countdownEl.style.display = "flex";
  } else {
    document.body.classList.remove("mode-countdown-active");
    window.scrollTo(0, 0);
    if (mode === "yearbook") {
      yearbookEl.style.display = "block";
      // Clear search on open
      document.getElementById("yearbookSearch").value = "";
      currentSearchQuery = "";
      selectedCategories.clear();
      applyFilters();
      renderStats();
    } else if (mode === "projects") {
      projectsEl.style.display = "block";
      renderProjects();
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
      <div id="co-ar">${msg.ar}</div>
      <div id="co-progress-wrap">
        <div id="co-progress-bar"></div>
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

    animateNumber("days", daysStr, previousValues.days);
    animateNumber("hours", hoursStr, previousValues.hours);
    animateNumber("minutes", minutesStr, previousValues.minutes);
    animateNumber("seconds", secondsStr, previousValues.seconds);

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

  // Animate number changes
  animateNumber("days", daysStr, previousValues.days);
  animateNumber("hours", hoursStr, previousValues.hours);
  animateNumber("minutes", minutesStr, previousValues.minutes);
  animateNumber("seconds", secondsStr, previousValues.seconds);

  previousValues = {
    days: daysStr,
    hours: hoursStr,
    minutes: minutesStr,
    seconds: secondsStr,
  };

  updateLocalTime();
}

// ===== Animate Number =====
function animateNumber(id, newValue, oldValue) {
  const el = document.getElementById(id);
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

  for (let i = 0; i < 150; i++) {
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
