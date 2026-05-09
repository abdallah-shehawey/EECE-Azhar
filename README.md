# 🎓 EECE Class of 2026 — Graduation Website

> **Electronics & Communication Engineering · Faculty of Engineering · Al-Azhar University**

An interactive, single-page graduation celebration website for the **Class of 2026** of the Communication and Electronics Engineering department. It features a live multi-event countdown timer, a digital class yearbook with filtering and search, and a graduation projects showcase — all wrapped in a modern glassmorphism dark UI with an ambient randomized music playlist.

[![Live Preview](https://img.shields.io/badge/Live%20Preview-GitHub%20Pages-0d1117?logo=github)](https://abdallah-shehawey.github.io/EECE-Azhar/)
[![GitHub](https://img.shields.io/badge/GitHub-abdallah--shehawey-181717?logo=github)](https://github.com/abdallah-shehawey/EECE-Azhar)

---

## 📸 Preview

> A dark glassmorphism UI with floating particles, animated countdown cards, a student yearbook grid, and project team cards — all navigated through a top-level mode switcher.

---

## ✨ Features at a Glance

| Feature | Description |
|---|---|
| ⏱ Countdown Timer | Live countdown to Exam, Discussion, and Party |
| 📸 Class Yearbook | 25 students, photos, tracks, social links |
| 📁 Graduation Projects | 5 project groups across 3 engineering categories |
| 🎵 Music Player | Randomized ambient playlist, tap to play |
| 🎨 Glassmorphism UI | Dark theme, blur cards, floating particles |
| 📱 Mobile-Optimized | Separate performance CSS for mobile devices |

---

## 🗂 Project Structure

```bash
EECE-Azhar/
├── index.html          # Main HTML — structure, navigation, and layout
├── style.css           # Core styles (glassmorphism, animations, grid layouts)
├── mobile_perf.css     # Mobile-specific performance optimizations
├── script.js           # All JavaScript logic (data, countdown, yearbook, projects)
├── sort_students.js    # Utility script for sorting student data
├── bg.jpg              # Full-page background image
├── favicon.ico         # Browser tab icon
├── websiteicon.png     # 64×64 PNG site icon
├── logo-faculty.png    # Faculty of Engineering logo
├── logo-university.png # Al-Azhar University logo
├── Pic/                # Student profile photos (25 × .jpg/.jpeg)
├── audio/              # Background music tracks (4 × .m4a)
├── icons/              # Social media and UI icons (SVG + PNG)
└── font/               # Self-hosted PoetsenOne font (TTF)
```

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Structure | HTML5 (semantic elements) |
| Styling | Vanilla CSS3 (variables, Grid, Flexbox, `backdrop-filter`) |
| Logic | Vanilla JavaScript ES6+ (no frameworks, no build step) |
| Fonts | PoetsenOne (self-hosted TTF) · Outfit & DM Sans (Google Fonts) |
| Icons | Custom SVG + PNG icon set |
| Audio | HTML5 `<audio>` API |

> No npm, no bundler, no external runtime dependencies — open `index.html` in any modern browser and it just works.

---

## 🚀 Getting Started

### Run Locally

Since this is a pure HTML/CSS/JS project, no installation is needed. Serve it with any static server:

```bash
# Python 3
python3 -m http.server 8080
```

Then open `http://localhost:8080` in your browser.

> ⚠️ Direct `file://` opening may block audio autoplay or lazy-loaded images in some browsers. A local server is recommended.

---

## 🧠 How the Code Works — Full Walkthrough

All application logic lives in **`script.js`** (~1,300 lines). Here is a section-by-section explanation of everything it does.

---

### 1. Data — `EVENTS`, `STUDENTS`, `GRADUATION_PROJECTS`

The file starts by defining three plain JavaScript objects that act as the entire data layer:

#### `EVENTS`

```js
const EVENTS = {
    exam:       { label: 'Final Exam (10:00 AM - 1:00 PM)', date: new Date('2026-06-03T10:00:00') },
    discussion: { label: 'Project Discussion',               date: new Date('2026-07-01T10:00:00') },
    party:      { label: 'Graduation Party',                 date: new Date('2026-07-22T10:00:00') },
};
```

Each key maps directly to a countdown tab button in `index.html`. Switching tabs reads `EVENTS[currentTab].date` to know which date to count down to.

#### `STUDENTS`

An array of 25 objects. Each student has:

- `name` — full name (used for display and search)
- `photo` — relative path to their image in `Pic/`
- `track` — string or array of strings (e.g. `['Embedded Systems', 'DevOps']`)
- `color` — a CSS gradient string used as avatar fallback background
- `social` — object with optional `linkedin`, `github`, `whatsapp`, `facebook`, `email` values

#### `GRADUATION_PROJECTS`

An array of 5 project group objects. Each has:

- `category` — `'Digital'`, `'Embedded'`, or `'Network'`
- `icon` — an emoji used on the card header
- `team` — array of `{ name, leader }` objects. The `leader: true` flag triggers the star badge and "Team Leader" label in the modal.

---

### 2. Countdown Timer

**How it works:**

1. On page load, `startCountdown()` is called. It clears any previous interval and immediately calls `updateCountdown()`, then sets a `setInterval` to call it every 1,000 ms.
2. `updateCountdown()` reads `EVENTS[currentTab].date`, computes the difference from `new Date()` in milliseconds, then decomposes it into days/hours/minutes/seconds using integer division and modulo.
3. Each value is displayed using `animateNumber(id, newValue, oldValue)` — if the value changed, it briefly adds a CSS class `number-changed` (which triggers a flash animation) and removes it using a forced reflow (`void el.offsetWidth`).
4. If the countdown reaches zero (`diff <= 0`), the celebration panel appears and `launchConfetti()` fires 100 animated confetti elements using `setTimeout` staggering.

**Tab switching** (`switchTab(tab)`) simply updates `currentTab`, resets `previousValues` to force all digits to re-animate, and calls `startCountdown()` again.

---

### 3. Class Yearbook

#### Rendering (`renderYearbook(list)`)

Takes an optional filtered array (defaults to all `STUDENTS`). For each student it builds a card DOM node entirely via the DOM API (no `innerHTML` in the loop — safer and faster):

- A `<div class="student-photo-wrap">` containing either an `<img>` (lazy + async decoded) or an initials avatar `<div>`.
- An `onerror` handler on the `<img>` automatically replaces it with the avatar fallback if the photo fails to load.
- Clicking anywhere on the card (except social buttons) calls `openPhotoModal(student)`.

#### Search (`filterStudents(query)`)

Stores the trimmed lowercase query in `currentSearchQuery`, then calls `applyFilters()`.

#### Category Filter (`toggleCategoryFilter(cat)`)

Maintains a `Set` called `selectedCategories`. Clicking "All" clears the set; clicking any other category toggles it in/out. Then calls `applyFilters()`.

#### Combined Filtering (`applyFilters()`)

Runs both filters at once:

```
matchesText = name includes query OR any track includes query
matchesCategory = at least one of the student's categories is in selectedCategories
result = matchesText AND matchesCategory
```

Calls `renderYearbook(filtered)` with the result.

#### Track Category Mapping (`getStudentCategories(student)`)

Each student's raw track strings (e.g. `'Digital IC Design & Verification'`) are mapped to normalized category keys using keyword matching:

- `'embedded'` → `'Embedded'`
- `'digital'`, `'ic'`, `'asic'` → `'Digital Design'`
- `'network'` → `'Network'`
- `'ai'` → `'AI'`
- etc.

This normalized key is what the filter buttons use, keeping the display label (e.g. `'Digital Verification'`) decoupled from the filter key.

#### Statistics Bar (`renderStats()`)

Counts students per category, renders a row of clickable `stat-item` chips with animated counters. The counter animation uses `setInterval` with an ease-out quadratic curve:

```js
const easeOut = 1 - (1 - progress) * (1 - progress);
el.textContent = Math.round(target * easeOut);
```

#### Photo Modal (`openPhotoModal(student)`)

Created once lazily and reused. When called:

1. Generates HTML for the track badge(s), social buttons, and optional "Team Leader" badge.
2. Sets `modal.innerHTML`, makes it visible with `display: flex`, then triggers the CSS open animation via `classList.add('active')`.
3. Pushes `#student` to `history` so the mobile hardware back button closes the modal instead of exiting the page.
4. A `popstate` listener calls `modal.closeModal(true)` (skipping the `history.back()` call to avoid a loop).

---

### 4. Graduation Projects

#### Rendering (`renderProjects()`)

Filters `GRADUATION_PROJECTS` by `currentProjectCat`, then for each project builds a card with three sections:

- **Top** — category badge + SVG/PNG icon
- **Body** — "Coming Soon" panel with a live mini-countdown to the Project Discussion date (`data-project-countdown-unit` attributes updated by `updateProjectDiscussionCountdowns()`)
- **Team** — a row of clickable member pills. Each pill looks up the student in `STUDENTS` by name to get their photo/color. Clicking a pill calls `openPhotoModal(student)` (passing `teamLeader: true` for leaders to render the star badge in the modal).

#### Project Discussion Mini-Countdown

`updateProjectDiscussionCountdowns()` runs on the same 1-second interval as the main countdown. It reads `EVENTS.discussion.date`, computes the difference, and updates all `[data-project-countdown-unit]` elements inside every visible project card simultaneously.

---

### 5. Audio Player

```
audioFiles[]  →  shuffleArray()  →  shuffledPlaylist[]  →  <audio> src
```

- On `DOMContentLoaded`, `initAudio()` shuffles the 4 tracks using the **Fisher-Yates algorithm** and sets `<audio src>` to the first track (no autoplay — browsers block it without a user gesture).
- `toggleAudio()` handles three states: first-ever click (calls `audio.play()`), subsequent resume, and pause.
- When a track ends, the `ended` event listener advances `currentTrackIndex`. When the playlist is exhausted it re-shuffles automatically.
- The button label cycles between `"🔇 Tap to Play"` → `"🔊 Playing"` → `"🔇 Muted"`.

---

### 6. Floating Particles

`createParticles()` runs once on load. It detects mobile (`window.innerWidth <= 768`) and spawns **25 particles on mobile, 120 on desktop**.

Each particle is a `<div class="particle">` with randomized:

- `width` / `height` (1.5–4.5 px)
- `left` position (0–100% of viewport width)
- `animation-duration` (10–25 s)
- `animation-delay` (negative, so they are already mid-flight on load)
- `background` — a radial gradient on desktop, a flat HSL color on mobile (cheaper to render)

All particles are added in a single `DocumentFragment` → one DOM insertion for performance.

---

### 7. Navigation (Mode & Tab Switching)

The site has two navigation levels:

**Top-level modes** (rendered by `switchMode(mode)`):

- `countdown` — shows `#mode-countdown`
- `yearbook` — shows `#mode-yearbook`, resets search/filters, re-renders stats
- `projects` — shows `#mode-projects`, re-renders the project grid

**Countdown sub-tabs** (rendered by `switchTab(tab)`):

- `exam` / `discussion` / `party` — switches `currentTab`, restarts the countdown interval

Both functions update `classList.add('active')` on the relevant button and use `style.display` toggling on sections (not CSS class toggling) to avoid layout paint issues on low-end devices.

---

## 🎨 Design System

### Color Palette

| Token | Value | Usage |
|---|---|---|
| Background | `#0a0a1e` | Deep space dark base |
| Primary accent | `#8b5cf6` → `#6d28d9` | Purple gradient (default cards) |
| Secondary | `#ef4444` → `#b91c1c` | Red gradient |
| Highlight | `#ec4899` → `#be185d` | Pink gradient |
| Glass surface | `rgba(255,255,255,0.05)` | Card backgrounds |
| Glass border | `rgba(255,255,255,0.1)` | Card borders |

### Glassmorphism Cards

```css
background: rgba(255, 255, 255, 0.05);
backdrop-filter: blur(20px);
border: 1px solid rgba(255, 255, 255, 0.1);
border-radius: 20px;
```

### Typography

- **PoetsenOne** — self-hosted, preloaded, used as the site-wide default
- **Outfit** — fallback for body text weights 300–900
- **DM Sans** — fallback for UI labels

---

## 📱 Mobile Optimizations

`mobile_perf.css` is loaded **only** on screens ≤ 768 px via:

```html
<link rel="stylesheet" href="mobile_perf.css" media="(max-width: 768px)">
```

It applies:

- Removes `backdrop-filter` (GPU-expensive on low-end phones) and replaces with solid semi-transparent backgrounds
- Reduces particle count from 120 → 25 (done in JS)
- Applies `transform: translateZ(0)` (GPU layer promotion) on scroll containers
- Simplifies box-shadows and gradients
- The photo modal back button uses `history.pushState` + `popstate` to integrate with the Android hardware back button

---

## 📂 How to Add a New Student

1. Add the student's photo to `Pic/` (JPEG preferred, compressed to < 200 KB for performance)
2. Add a new entry to the `STUDENTS` array in `script.js`:

```js
{
    name: 'Student Full Name',
    photo: 'Pic/filename.jpg',
    track: ['Track 1', 'Track 2'],
    color: 'linear-gradient(135deg, #8b5cf6, #6d28d9)', // avatar fallback color
    social: {
        linkedin: 'https://linkedin.com/in/...',
        github:   'https://github.com/...',
        whatsapp: '+20XXXXXXXXXX',
        facebook: 'https://facebook.com/...',
    },
},
```

1. The yearbook, filters, and stats update automatically — no other changes needed.

---

## 📂 How to Add a New Graduation Project Group

Add a new entry to `GRADUATION_PROJECTS` in `script.js`:

```js
{
    category: 'Digital',   // 'Digital' | 'Embedded' | 'Network'
    icon: '🔬',
    team: [
        { name: 'Student Name', leader: true  },
        { name: 'Student Name', leader: false },
    ],
},
```

The project renders automatically under the correct category tab. Team member photos and modal links are resolved automatically from `STUDENTS` by name matching.

---

## 🤝 Contributing

Contributions are welcome! Whether you want to fix a bug, improve the design, add a feature, or update student data — every pull request is appreciated.

Please read [**CONTRIBUTING.md**](CONTRIBUTING.md) for the full guide on how to get started.

**Quick summary:**

1. Fork the repository
2. Create a branch: `git checkout -b feature/your-feature-name`
3. Make your changes
4. Commit: `git commit -m "feat: describe your change"`
5. Push: `git push origin feature/your-feature-name`
6. Open a Pull Request on GitHub

---

## 👨‍💻 Developer

**Abdallah Shehawey**  
Electronics & Communication Engineering — Class of 2026, Al-Azhar University

[![GitHub](https://img.shields.io/badge/GitHub-abdallah--shehawey-181717?logo=github)](https://github.com/abdallah-shehawey/Graduation-Website)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-Abdallah%20Shehawey-0A66C2?logo=linkedin)](https://www.linkedin.com/in/abdallah-shehawey)

---

## 📄 License

This project is open source. Feel free to fork and adapt it for your own graduation class! 🎓
