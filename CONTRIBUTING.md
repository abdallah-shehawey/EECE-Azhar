# 🤝 Contributing to EECE Class of 2026

Thanks for your interest in contributing! This guide will walk you through everything you need to know.

---

## 📋 Table of Contents

- [Types of Contributions](#-types-of-contributions)
- [Getting Started](#-getting-started)
- [Project Structure](#-project-structure)
- [How to Add a Student](#-how-to-add-a-student)
- [How to Add a Graduation Project](#-how-to-add-a-graduation-project)
- [How to Fix a Bug or Improve the UI](#-how-to-fix-a-bug-or-improve-the-ui)
- [Commit Message Guidelines](#-commit-message-guidelines)
- [Pull Request Checklist](#-pull-request-checklist)
- [Code Style](#-code-style)

---

## 🧩 Types of Contributions

You can contribute in many ways:

| Type | Examples |
|---|---|
| 🐛 Bug Fix | Fix a broken layout, a JS error, a broken link |
| ✨ New Feature | Add a new section, a new filter, a new animation |
| 🎨 UI Improvement | Improve responsiveness, colors, spacing |
| 📝 Data Update | Add/update a student's info or social links |
| ⚡ Performance | Optimize images, CSS, or JS |
| 📖 Documentation | Improve the README or this guide |

---

## 🚀 Getting Started

### 1. Fork the Repository

Click **Fork** at the top right of the repo page on GitHub.

### 2. Clone Your Fork

```bash
git clone git@github.com:abdallah-shehawey/EECE-Azhar.git
cd EECE-Azhar
```

### 3. Create a Branch

Always create a new branch for your changes — never commit directly to `main`.

```bash
git checkout -b feature/your-feature-name
# or for bug fixes:
git checkout -b fix/describe-the-bug
```

### 4. Run Locally

No build step needed. Just serve the files with any static server:

```bash
# Python 3
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

### 5. Make Your Changes

See the specific guides below depending on what you want to change.

### 6. Commit and Push

```bash
git add .
git commit -m "feat: describe what you added"
git push origin feature/your-feature-name
```

### 7. Open a Pull Request

Go to GitHub and click **"Compare & pull request"**. Fill in the PR template and submit.

---

## 📂 Project Structure

```bash
EECE-Azhar/
├── index.html       # HTML structure — do not change unless adding a new section
├── style.css        # All core CSS — glassmorphism, animations, layout
├── mobile_perf.css  # Mobile-only overrides — touch with care
├── script.js        # ALL data + ALL logic lives here
├── Pic/             # Student photos → add new photos here
├── audio/           # Background music tracks
├── icons/           # Social/UI icon assets
└── font/            # Self-hosted fonts
```

> **Rule of thumb:** Most contributions only need changes to `script.js` and/or `Pic/`.

---

## 👤 How to Add a Student

### Step 1 — Add the Photo

- Place the student's photo in the `Pic/` folder
- Use **JPEG format** (`.jpg` or `.jpeg`)
- **Compress it** to under **200 KB** before adding ([use Squoosh](https://squoosh.app/) or similar)
- Name the file clearly, e.g. `firstname_lastname.jpg` (all lowercase, no spaces)

### Step 2 — Add the Student Object

Open `script.js` and find the `STUDENTS` array (starts around line 18). Add a new object at the correct alphabetical position:

```js
{
    name: 'First Last',                        // Full name — used for search and display
    photo: 'Pic/filename.jpg',                 // Path to the photo you added
    track: ['Track One', 'Track Two'],         // Academic specialization(s)
    color: 'linear-gradient(135deg, #8b5cf6, #6d28d9)', // Avatar fallback color
    social: {
        linkedin:  'https://linkedin.com/in/...',  // Full URL or leave empty string ''
        github:    'https://github.com/...',
        whatsapp:  '+20XXXXXXXXXX',               // International format with country code
        facebook:  'https://facebook.com/...',
    },
},
```

**Available gradient presets:**

| Color | CSS Value |
|---|---|
| Purple | `linear-gradient(135deg, #8b5cf6, #6d28d9)` |
| Red | `linear-gradient(135deg, #ef4444, #b91c1c)` |
| Pink | `linear-gradient(135deg, #ec4899, #be185d)` |
| Blue | `linear-gradient(135deg, #3b82f6, #1d4ed8)` |
| Sky | `linear-gradient(135deg, #0ea5e9, #1e3a8a)` |
| Green | `linear-gradient(135deg, #10b981, #047857)` |
| Amber | `linear-gradient(135deg, #f59e0b, #b45309)` |

> If a social link is unknown or unavailable, set it to an empty string `''` — it will be hidden automatically.

### Step 3 — Verify

1. Open the site locally
2. Switch to **Class Yearbook** mode
3. Confirm the student card appears with the correct photo, name, tracks, and social links
4. Click the card to open the photo modal and verify it looks correct

---

## 📁 How to Add a Graduation Project

Open `script.js` and find the `GRADUATION_PROJECTS` array (around line 706). Add a new entry:

```js
{
    category: 'Digital',   // Must be exactly: 'Digital' | 'Embedded' | 'Network'
    icon: '🔬',            // Emoji shown on the card header
    team: [
        { name: 'Full Student Name', leader: true  },   // Team leader (gets star badge)
        { name: 'Full Student Name', leader: false },
        { name: 'Full Student Name', leader: false },
    ],
},
```

> ⚠️ **Important:** `name` values in the team array must **exactly match** the `name` field of a student in `STUDENTS`. This is how the avatar photo and modal link are resolved automatically. If the name doesn't match, the member shows an initials avatar with no clickable profile.

---

## 🐛 How to Fix a Bug or Improve the UI

- **CSS changes** → edit `style.css` (or `mobile_perf.css` for mobile-only fixes)
- **JS logic changes** → edit `script.js`
- **Layout/structure changes** → edit `index.html`

Please do **not** introduce external libraries or npm packages. The project is intentionally dependency-free.

---

## 📝 Commit Message Guidelines

Use the **Conventional Commits** format:

```
type: short description
```

| Type | When to use |
|---|---|
| `feat` | Adding a new feature or student |
| `fix` | Fixing a bug |
| `style` | CSS/UI changes (no logic change) |
| `perf` | Performance improvement |
| `docs` | README or documentation update |
| `chore` | Repo maintenance (renaming files, etc.) |

**Examples:**

```bash
git commit -m "feat: add Mohamed Ibrahim to students yearbook"
git commit -m "fix: student photo modal closes on mobile back button"
git commit -m "style: improve project card spacing on small screens"
git commit -m "perf: compress student photos to reduce page load"
```

---

## ✅ Pull Request Checklist

Before submitting your PR, make sure:

- [ ] The site loads without console errors
- [ ] Your changes work on both **desktop and mobile** (resize the browser to test)
- [ ] Student photos are compressed to < 200 KB
- [ ] Student names in project teams exactly match names in the `STUDENTS` array
- [ ] No external libraries were added
- [ ] Your branch is up to date with `main`
- [ ] Your commit message follows the format above

---

## 🎨 Code Style

- **Indentation:** 4 spaces (no tabs)
- **Quotes:** Single quotes `'...'` for JS strings
- **Semicolons:** Required in JS
- **CSS:** Properties in logical order (positioning → box model → typography → visual)
- **No inline styles** in HTML — use CSS classes instead
- **Comments:** Add a comment when the logic is not immediately obvious

---

## ❓ Questions?

Open an [Issue](https://github.com/abdallah-shehawey/Graduation-Website/issues) on GitHub or reach out directly:

**Abdallah Shehawey** — [LinkedIn](https://www.linkedin.com/in/abdallah-shehawey) · [GitHub](https://github.com/abdallah-shehawey)
