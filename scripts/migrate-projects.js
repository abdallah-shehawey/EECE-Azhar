/**
 * One-off Firebase migration for GRADUATION PROJECTS.
 *
 *   node scripts/migrate-projects.js <DB_URL> <DB_SECRET>            # dry-run (no writes)
 *   node scripts/migrate-projects.js <DB_URL> <DB_SECRET> --commit   # writes the changes
 *
 * Why: a graduation project's metadata (track, university, department, classYear)
 * must live on the PROJECT itself — not be inferred from its members' profiles.
 * Legacy project records only carried a short `category` key (Digital/Embedded/
 * Network) and no hierarchy fields, so the front-end had to guess. This stamps
 * the canonical project-level metadata onto every record.
 *
 * What it does (per project):
 *  • Backs up /projects to scripts/backup/ before any write.
 *  • Adds a `track` ARRAY (primary first) derived from the category when missing:
 *        Digital  → ["Digital IC Design", "ASIC Verification"]
 *        Embedded → ["Embedded Systems", "Embedded Linux", "IoT", "AI"]
 *        Network  → ["Network"]
 *    An existing `track` (string or array) is normalised to a de-duped array and
 *    preserved — the migration never overwrites a track that's already set.
 *  • Sets University = "Al-Azhar University",
 *        Faculty     = "Faculty of Engineering",
 *        Department  = "Electronics and Communication Engineering",
 *        classYear   = "2026"
 *    for every project that's missing them (all current projects are EECE 2026).
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
  console.error("Usage: node scripts/migrate-projects.js <DB_URL> <DB_SECRET> [--commit]");
  process.exit(1);
}
const baseUrl = dbUrl.endsWith("/") ? dbUrl : `${dbUrl}/`;

// ---- Canonical project-level metadata (all current projects are EECE 2026) ----
const CANON_UNIVERSITY = "Al-Azhar University";
const CANON_FACULTY = "Faculty of Engineering";
const CANON_DEPARTMENT = "Electronics and Communication Engineering";
const CANON_CLASS_YEAR = "2026";

// Legacy category → project track set (primary first). Kept in sync with the
// CAT_TO_TRACKS map in the front-end (script.js / portal.js).
const CAT_TO_TRACKS = {
  Digital: ["Digital IC Design", "ASIC Verification"],
  Embedded: ["Embedded Systems", "Embedded Linux", "IoT", "AI"],
  Network: ["Network"],
};

// Normalise a project's existing track field to a de-duped array (order kept),
// seeding from the category when nothing is set. Primary track stays first.
function resolveTracks(rec) {
  let raw = rec.track !== undefined ? rec.track : rec.tracks;
  if (typeof raw === "string") raw = raw.trim() ? [raw.trim()] : [];
  else if (Array.isArray(raw)) raw = raw.map((x) => String(x || "").trim()).filter(Boolean);
  else raw = [];

  if (raw.length) {
    const seen = new Set();
    return raw.filter((x) => (seen.has(x.toLowerCase()) ? false : (seen.add(x.toLowerCase()), true)));
  }
  if (rec.category && CAT_TO_TRACKS[rec.category]) return [...CAT_TO_TRACKS[rec.category]];
  if (rec.category) return [rec.category];
  return [];
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

// ---- Transform the projects collection -------------------------------------
function transformProjects(obj) {
  const next = {};
  const changes = [];
  Object.entries(obj || {}).forEach(([key, rec]) => {
    const out = { ...rec };
    const who = rec.name || rec.title || key;

    // track → de-duped array (primary first); seed from category when missing.
    const before = rec.track !== undefined ? rec.track : rec.tracks;
    const after = resolveTracks(rec);
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      changes.push(`  [${who}] track: ${JSON.stringify(before)} → ${JSON.stringify(after)}`);
    }
    out.track = after;
    // Drop a stray `tracks` field if we standardised onto `track`.
    if (out.tracks !== undefined) delete out.tracks;

    if (rec.university !== CANON_UNIVERSITY) {
      changes.push(`  [${who}] university: ${JSON.stringify(rec.university)} → "${CANON_UNIVERSITY}"`);
      out.university = CANON_UNIVERSITY;
    }
    if (rec.faculty !== CANON_FACULTY) {
      changes.push(`  [${who}] faculty: ${JSON.stringify(rec.faculty)} → "${CANON_FACULTY}"`);
      out.faculty = CANON_FACULTY;
    }
    if (rec.department !== CANON_DEPARTMENT) {
      changes.push(`  [${who}] department: ${JSON.stringify(rec.department)} → "${CANON_DEPARTMENT}"`);
      out.department = CANON_DEPARTMENT;
    }
    if (String(rec.classYear || "") !== CANON_CLASS_YEAR) {
      changes.push(`  [${who}] classYear: ${JSON.stringify(rec.classYear)} → "${CANON_CLASS_YEAR}"`);
      out.classYear = CANON_CLASS_YEAR;
    }
    next[key] = out;
  });
  return { next, changes };
}

async function main() {
  console.log(`\n${COMMIT ? "\x1b[33m*** COMMIT MODE — will write to Firebase ***\x1b[0m" : "DRY RUN — no writes"}\n`);

  const projects = (await fetchJson("projects")) || {};

  // Backup before anything.
  const backupDir = path.join(__dirname, "backup");
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  fs.writeFileSync(path.join(backupDir, `projects-${stamp}.json`), JSON.stringify(projects, null, 2));
  console.log(`Backup written to scripts/backup/projects-${stamp}.json`);

  const { next, changes } = transformProjects(projects);

  console.log(`\n===== projects changes (${changes.length}) =====`);
  console.log(changes.join("\n") || "  (none)");

  // Track set after migration (handy sanity check).
  const finalTracks = new Set();
  Object.values(next).forEach((r) => (r.track || []).forEach((t) => finalTracks.add(t)));
  console.log(`\n===== project tracks after migration =====\n  ${[...finalTracks].sort().join("\n  ") || "(none)"}`);

  if (!COMMIT) {
    console.log(`\nDRY RUN complete. Re-run with --commit to write these changes.`);
    return;
  }

  await putJson("projects", next);
  console.log("\n\x1b[32m✔ projects written\x1b[0m");
  console.log("\n🎉 Project migration committed.");
}

main().catch((e) => { console.error("\x1b[31mFailed:\x1b[0m", e.message); process.exit(1); });
