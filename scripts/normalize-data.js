/**
 * One-off Firebase data cleanup for the EECE yearbook.
 *
 *   node scripts/normalize-data.js <DB_URL> <DB_SECRET>            # dry-run (no writes)
 *   node scripts/normalize-data.js <DB_URL> <DB_SECRET> --commit   # writes the changes
 *
 * What it does (per the agreed rules):
 *  • Backs up /students and /profiles to scripts/backup/ before any write.
 *  • Normalizes every track to a canonical form, splitting combined
 *    "design & verification" tracks into two tracks.
 *  • Sets University = "Al-Azhar University",
 *        Department  = "Electronics and Communication Engineering",
 *        classYear   = "2026"
 *    for every student (all current records are EECE 2026).
 *  • Preserves all other fields and the existing keys/order.
 *
 * A dry-run prints exactly what would change so it can be reviewed first.
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

const dbUrl = process.argv[2];
const dbSecret = process.argv[3];
const COMMIT = process.argv.includes("--commit");

if (!dbUrl || !dbSecret) {
  console.error("Usage: node scripts/normalize-data.js <DB_URL> <DB_SECRET> [--commit]");
  process.exit(1);
}
const baseUrl = dbUrl.endsWith("/") ? dbUrl : `${dbUrl}/`;

// ---- Canonical institution values (all current students are EECE 2026) ----
const CANON_UNIVERSITY = "Al-Azhar University";
const CANON_DEPARTMENT = "Electronics and Communication Engineering";
const CANON_CLASS_YEAR = "2026";

// ---- Track normalization ----------------------------------------------------
// Returns an array of canonical tracks for a single raw track string. Most map
// 1→1; the combined "design & verification" variants map 1→2.
function normalizeTrack(raw) {
  const t = String(raw || "").trim();
  if (!t) return [];
  const k = t.toLowerCase().replace(/\s*&\s*/g, " and ").replace(/\s+/g, " ").trim();

  // Combined digital design + verification → two separate canonical tracks.
  if (
    k === "digital design and verification" ||
    k === "digital ic design and verification" ||
    k === "digital design verification"
  ) {
    return ["Digital IC Design", "ASIC Verification"];
  }

  // Digital design family → Digital IC Design.
  if (
    k === "digital design" ||
    k === "digital ic design" ||
    k === "digital" ||
    k === "ic design"
  ) {
    return ["Digital IC Design"];
  }

  // Verification family → ASIC Verification.
  if (
    k === "verification" ||
    k === "asic verification" ||
    k === "digital verification" ||
    k === "ic verification"
  ) {
    return ["ASIC Verification"];
  }

  // Embedded Linux must be checked before the generic "embedded" rule.
  if (k === "embedded linux") return ["Embedded Linux"];

  // Embedded systems family (singular/plural, any case) → Embedded Systems.
  if (k === "embedded system" || k === "embedded systems" || k === "embedded") {
    return ["Embedded Systems"];
  }

  // Network security (any case) → Network Security.
  if (k === "network security") return ["Network Security"];

  // Network engineer/engineering → Network Engineering.
  if (k === "network engineer" || k === "network engineering") {
    return ["Network Engineering"];
  }

  // Everything else: keep the value, just normalize casing/spacing via a small
  // known map; otherwise Title Case it (acronyms like AI/IoT kept upper).
  const KNOWN = {
    ai: "AI",
    "machine learning": "Machine Learning",
    "data science": "Data Science",
    devops: "DevOps",
    "cloud computing": "Cloud Computing",
    "cyber security": "Cyber Security",
    "software testing": "Software Testing",
    qa: "QA",
    "ui/ux": "UI/UX",
    "game development": "Game Development",
    robotics: "Robotics",
    iot: "IoT",
    automotive: "Automotive",
    "mobile communication": "Mobile Communication",
    "mobile development": "Mobile Development",
    "backend development": "Backend Development",
    "frontend development": "Frontend Development",
    "full stack development": "Full Stack Development",
  };
  if (KNOWN[k]) return [KNOWN[k]];
  // Title-case fallback.
  return [t.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())];
}

// Normalize a record's track field (which may be `track` or `tracks`) and
// return a de-duplicated, order-preserved canonical array.
function normalizeRecordTracks(rec) {
  let raw = rec.track !== undefined ? rec.track : rec.tracks;
  if (!Array.isArray(raw)) raw = raw ? [raw] : [];
  const out = [];
  raw.forEach((x) => {
    normalizeTrack(x).forEach((c) => { if (!out.includes(c)) out.push(c); });
  });
  return out;
}

// ---- HTTPS helpers ----------------------------------------------------------
function fetchJson(node) {
  return new Promise((resolve, reject) => {
    https.get(`${baseUrl}${node}.json?auth=${dbSecret}`, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(JSON.parse(body || "null"));
        else reject(new Error(`GET ${node} → ${res.statusCode}: ${body}`));
      });
    }).on("error", reject);
  });
}
function putJson(node, data) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${baseUrl}${node}.json?auth=${dbSecret}`);
    const payload = JSON.stringify(data);
    const req = https.request(
      { hostname: url.hostname, path: url.pathname + url.search, method: "PUT",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(JSON.parse(body || "null"));
          else reject(new Error(`PUT ${node} → ${res.statusCode}: ${body}`));
        });
      }
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

// ---- Transform one collection ----------------------------------------------
// Returns { next, changes } where `next` is the rewritten object and `changes`
// is a human-readable list of what changed (for the dry-run report).
function transformCollection(obj, { setInstitution }) {
  const next = {};
  const changes = [];
  Object.entries(obj || {}).forEach(([key, rec]) => {
    const out = { ...rec };
    const who = rec.name || key;

    // Tracks → canonical. Write back to whichever field the record used.
    const before = (Array.isArray(rec.track) ? rec.track : rec.track ? [rec.track] :
                    Array.isArray(rec.tracks) ? rec.tracks : rec.tracks ? [rec.tracks] : []);
    const after = normalizeRecordTracks(rec);
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      changes.push(`  [${who}] tracks: ${JSON.stringify(before)} → ${JSON.stringify(after)}`);
    }
    if (rec.tracks !== undefined && rec.track === undefined) out.tracks = after;
    else out.track = after;

    if (setInstitution) {
      if (rec.university !== CANON_UNIVERSITY) {
        changes.push(`  [${who}] university: ${JSON.stringify(rec.university)} → "${CANON_UNIVERSITY}"`);
        out.university = CANON_UNIVERSITY;
      }
      if (rec.department !== CANON_DEPARTMENT) {
        changes.push(`  [${who}] department: ${JSON.stringify(rec.department)} → "${CANON_DEPARTMENT}"`);
        out.department = CANON_DEPARTMENT;
      }
      if (String(rec.classYear || "") !== CANON_CLASS_YEAR) {
        changes.push(`  [${who}] classYear: ${JSON.stringify(rec.classYear)} → "${CANON_CLASS_YEAR}"`);
        out.classYear = CANON_CLASS_YEAR;
      }
    }
    next[key] = out;
  });
  return { next, changes };
}

async function main() {
  console.log(`\n${COMMIT ? "\x1b[33m*** COMMIT MODE — will write to Firebase ***\x1b[0m" : "DRY RUN — no writes"}\n`);

  const students = (await fetchJson("students")) || {};
  const profiles = (await fetchJson("profiles")) || {};

  // Backup before anything.
  const backupDir = path.join(__dirname, "backup");
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  fs.writeFileSync(path.join(backupDir, `students-${stamp}.json`), JSON.stringify(students, null, 2));
  fs.writeFileSync(path.join(backupDir, `profiles-${stamp}.json`), JSON.stringify(profiles, null, 2));
  console.log(`Backup written to scripts/backup/ (stamp ${stamp})`);

  // Students: normalize tracks + set institution (all are EECE 2026).
  const s = transformCollection(students, { setInstitution: true });
  // Profiles: normalize tracks + set institution too (keeps the live merge consistent).
  const p = transformCollection(profiles, { setInstitution: true });

  console.log(`\n===== students changes (${s.changes.length}) =====`);
  console.log(s.changes.join("\n") || "  (none)");
  console.log(`\n===== profiles changes (${p.changes.length}) =====`);
  console.log(p.changes.join("\n") || "  (none)");

  // Canonical track set after cleanup (handy sanity check).
  const finalTracks = new Set();
  [...Object.values(s.next), ...Object.values(p.next)].forEach((r) => {
    (r.track || r.tracks || []).forEach((t) => finalTracks.add(t));
  });
  console.log(`\n===== canonical tracks after cleanup =====\n  ${[...finalTracks].sort().join("\n  ")}`);

  if (!COMMIT) {
    console.log(`\nDRY RUN complete. Re-run with --commit to write these changes.`);
    return;
  }

  await putJson("students", s.next);
  console.log("\n\x1b[32m✔ students written\x1b[0m");
  await putJson("profiles", p.next);
  console.log("\x1b[32m✔ profiles written\x1b[0m");
  console.log("\n🎉 Cleanup committed.");
}

main().catch((e) => { console.error("\x1b[31mFailed:\x1b[0m", e.message); process.exit(1); });
