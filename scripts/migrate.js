const fs = require('fs');
const path = require('path');
const https = require('https');

// 1. Read command-line arguments
const dbUrl = process.argv[2];
const dbSecret = process.argv[3]; // Optional secret key

if (!dbUrl) {
  console.error('\x1b[31mError: Please provide your Firebase Realtime Database URL.\x1b[0m');
  console.log('Usage: node scripts/migrate.js <FIREBASE_DB_URL> [FIREBASE_DB_SECRET]');
  process.exit(1);
}

// Format the URL if it doesn't end with a slash
const baseUrl = dbUrl.endsWith('/') ? dbUrl : `${dbUrl}/`;

// 2. Load local files by replacing const declarations with global assignments
global.LOCAL_STUDENTS = [];
global.LOCAL_GRADUATION_PROJECTS = [];

try {
  let studentsCode = fs.readFileSync(path.join(__dirname, '../data/students.js'), 'utf8');
  // Replace the const assignment so it binds to the global scope in Node.js
  studentsCode = studentsCode.replace(/const\s+LOCAL_STUDENTS\s*=/, 'global.LOCAL_STUDENTS =');
  eval(studentsCode);
} catch (err) {
  console.error('\x1b[31mFailed to load data/students.js:\x1b[0m', err.message);
  process.exit(1);
}

try {
  let projectsCode = fs.readFileSync(path.join(__dirname, '../data/projects.js'), 'utf8');
  // Replace the const assignment so it binds to the global scope in Node.js
  projectsCode = projectsCode.replace(/const\s+LOCAL_GRADUATION_PROJECTS\s*=/, 'global.LOCAL_GRADUATION_PROJECTS =');
  eval(projectsCode);
} catch (err) {
  console.error('\x1b[31mFailed to load data/projects.js:\x1b[0m', err.message);
  process.exit(1);
}

const students = global.LOCAL_STUDENTS;
const projects = global.LOCAL_GRADUATION_PROJECTS;

console.log(`\x1b[32mSuccessfully loaded locally:\x1b[0m`);
console.log(`- ${students.length} Students`);
console.log(`- ${projects.length} Projects\n`);

if (students.length === 0 && projects.length === 0) {
  console.error('\x1b[31mError: Loaded 0 records. Check if data/students.js and data/projects.js contain records.\x1b[0m');
  process.exit(1);
}

// Convert students array to an object keyed by sanitized names
const studentsObj = {};
students.forEach(s => {
  const key = s.name.replace(/[\.\$\#\[\]\/\s]/g, "");
  studentsObj[key] = s;
});

// Convert projects array to an object keyed by sanitized categories
const projectsObj = {};
projects.forEach(p => {
  const key = p.category.replace(/[\.\$\#\[\]\/\s]/g, "");
  projectsObj[key] = p;
});

// 3. Define helper to perform PUT request using native HTTPS (no external dependencies)
function uploadData(nodeName, data) {
  return new Promise((resolve, reject) => {
    // Append auth query param if dbSecret is provided
    const queryParam = dbSecret ? `?auth=${dbSecret}` : '';
    const url = new URL(`${baseUrl}${nodeName}.json${queryParam}`);
    const payload = JSON.stringify(data);

    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const displayUrl = dbSecret 
      ? `${baseUrl}${nodeName}.json?auth=***` 
      : `${baseUrl}${nodeName}.json`;

    console.log(`Uploading ${nodeName} to ${displayUrl}...`);

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(body));
        } else {
          reject(new Error(`Server returned status code ${res.statusCode}: ${body}`));
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.write(payload);
    req.end();
  });
}

// 4. Run the upload
async function run() {
  try {
    console.log('Starting migration to Firebase Realtime Database...\n');
    
    // Upload Students as name-keyed object
    await uploadData('students', studentsObj);
    console.log('\x1b[32m✔ Students migrated successfully!\x1b[0m\n');

    // Upload Projects as category-keyed object
    await uploadData('projects', projectsObj);
    console.log('\x1b[32m✔ Projects migrated successfully!\x1b[0m\n');

    console.log('\x1b[32m🎉 Migration complete! All data is now live on Firebase with named keys.\x1b[0m');
  } catch (error) {
    console.error('\x1b[31mMigration failed:\x1b[0m', error.message);
    process.exit(1);
  }
}

run();
