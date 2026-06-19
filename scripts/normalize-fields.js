/**
 * One-off Firebase field-name normalization for STUDENTS + PROFILES.
 *
 *   node scripts/normalize-fields.js <DB_URL> <DB_SECRET>            # dry-run
 *   node scripts/normalize-fields.js <DB_URL> <DB_SECRET> --commit   # writes
 *
 * Why: an audit found the two collections disagreed on field names, so the
 * front-end had to special-case both:
 *   • students used `track` (singular); profiles used `tracks` (plural array).
 *   • profiles carried `faculty`; students didn't.
 *
 * This unifies BOTH collections onto a single, consistent schema:
 *   • tracks   → array of strings (the canonical field; `track` is removed).
 *   • faculty  → "Faculty of Engineering" when missing.
 *   • university / department / classYear → cohort defaults when missing.
 *
 * It backs up both collections first and preserves every other field + key/order.
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

const dbUrl = process.argv[2];
const dbSecret = process.argv[3];
const COMMIT = process.argv.includes("--commit");

if (!dbUrl || !dbSecret) {
  console.error("Usage: node scripts/normalize-fields.js <DB_URL> <DB_SECRET> [--commit]");
  process.exit(1);
}
const baseUrl = dbUrl.endsWith("/") ? dbUrl : `${dbUrl}/`;

const CANON_UNIVERSITY = "Al-Azhar University";
const CANON_FACULTY = "Faculty of Engineering";
const CANON_DEPARTMENT = "Electronics and Communication Engineering";
const CANON_CLASS_YEAR = "2026";

// Coerce whatever track field a record carries into a clean, de-duped array.
function toTracksArray(rec) {
  let raw = rec.tracks !== undefined ? rec.tracks : rec.track;
  if (typeof raw === "string") raw = raw.trim() ? [raw.trim()] : [];
  else if (Array.isArray(raw)) raw = raw.map((x) => String(x || "").trim()).filter(Boolean);
  else raw = [];
  const seen = new Set();
  return raw.filter((x) => (seen.has(x.toLowerCase()) ? false : (seen.add(x.toLowerCase()), true)));
}

function fetchJson(node) {
  return new Promise((resolve, reject) => {
    https.get(`${baseUrl}${node}.json?auth=${dbSecret}`, (res) => {
      let body = ""; res.on("data", (c) => (body += c));
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
        let body = ""; res.on("data", (c) => (body += c));
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(JSON.parse(body || "null"));
          else reject(new Error(`PUT ${node} → ${res.statusCode}: ${body}`));
        });
      }
    );
    req.on("error", reject); req.write(payload); req.end();
  });
}

function transform(obj, label) {
  const next = {};
  const changes = [];
  Object.entries(obj || {}).forEach(([key, rec]) => {
    if (!rec || typeof rec !== "object") { next[key] = rec; return; }
    const out = { ...rec };
    const who = rec.name || key;

    // Unify tracks → array; drop the legacy singular `track`.
    const beforeTracks = rec.tracks !== undefined ? rec.tracks : rec.track;
    const tracks = toTracksArray(rec);
    if (JSON.stringify(beforeTracks) !== JSON.stringify(tracks) || rec.track !== undefined) {
      changes.push(`  [${who}] track/tracks: ${JSON.stringify(beforeTracks)} → tracks:${JSON.stringify(tracks)}`);
    }
    out.tracks = tracks;
    if (out.track !== undefined) delete out.track;

    // Fill hierarchy defaults when missing (do NOT overwrite real values).
    if (!out.university) { out.university = CANON_UNIVERSITY; changes.push(`  [${who}] +university`); }
    if (!out.faculty) { out.faculty = CANON_FACULTY; changes.push(`  [${who}] +faculty`); }
    if (!out.department) { out.department = CANON_DEPARTMENT; changes.push(`  [${who}] +department`); }
    if (!out.classYear) { out.classYear = CANON_CLASS_YEAR; changes.push(`  [${who}] +classYear`); }

    next[key] = out;
  });
  console.log(`\n===== ${label} changes (${changes.length}) =====`);
  console.log(changes.join("\n") || "  (none)");
  return next;
}

async function main() {
  console.log(`\n${COMMIT ? "\x1b[33m*** COMMIT MODE — will write to Firebase ***\x1b[0m" : "DRY RUN — no writes"}\n`);

  const students = (await fetchJson("students")) || {};
  const profiles = (await fetchJson("profiles")) || {};

  const backupDir = path.join(__dirname, "backup");
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  fs.writeFileSync(path.join(backupDir, `students-fields-${stamp}.json`), JSON.stringify(students, null, 2));
  fs.writeFileSync(path.join(backupDir, `profiles-fields-${stamp}.json`), JSON.stringify(profiles, null, 2));
  console.log(`Backup written to scripts/backup/ (stamp ${stamp})`);

  const nextStudents = transform(students, "students");
  const nextProfiles = transform(profiles, "profiles");

  if (!COMMIT) {
    console.log(`\nDRY RUN complete. Re-run with --commit to write these changes.`);
    return;
  }
  await putJson("students", nextStudents);
  console.log("\n\x1b[32m✔ students written\x1b[0m");
  await putJson("profiles", nextProfiles);
  console.log("\x1b[32m✔ profiles written\x1b[0m");
  console.log("\n🎉 Field normalization committed.");
}

main().catch((e) => { console.error("\x1b[31mFailed:\x1b[0m", e.message); process.exit(1); });
