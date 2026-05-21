const fs = require('fs');
const path = require('path');
const https = require('https');

// 1. Read command-line arguments
const dbUrl = process.argv[2];
if (!dbUrl) {
  console.error('\x1b[31mError: Please provide your Firebase Realtime Database URL.\x1b[0m');
  console.log('Usage: node scripts/migrate.js https://<YOUR-PROJECT-ID>-default-rtdb.firebaseio.com/');
  process.exit(1);
}

// Format the URL if it doesn't end with a slash
const baseUrl = dbUrl.endsWith('/') ? dbUrl : `${dbUrl}/`;

// 2. Mock global variables to load files
global.STUDENTS = [];
global.GRADUATION_PROJECTS = [];

try {
  const studentsCode = fs.readFileSync(path.join(__dirname, '../data/students.js'), 'utf8');
  eval(studentsCode);
} catch (err) {
  console.error('\x1b[31mFailed to load data/students.js:\x1b[0m', err.message);
  process.exit(1);
}

try {
  const projectsCode = fs.readFileSync(path.join(__dirname, '../data/projects.js'), 'utf8');
  eval(projectsCode);
} catch (err) {
  console.error('\x1b[31mFailed to load data/projects.js:\x1b[0m', err.message);
  process.exit(1);
}

const students = global.STUDENTS;
const projects = global.GRADUATION_PROJECTS;

console.log(`\x1b[32mSuccessfully loaded locally:\x1b[0m`);
console.log(`- ${students.length} Students`);
console.log(`- ${projects.length} Projects\n`);

// 3. Define helper to perform PUT request using native HTTPS (no external dependencies)
function uploadData(nodeName, data) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${baseUrl}${nodeName}.json`);
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

    console.log(`Uploading ${nodeName} to ${url.toString()}...`);

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
    
    // Upload Students
    await uploadData('students', students);
    console.log('\x1b[32m✔ Students migrated successfully!\x1b[0m\n');

    // Upload Projects
    await uploadData('projects', projects);
    console.log('\x1b[32m✔ Projects migrated successfully!\x1b[0m\n');

    console.log('\x1b[32m🎉 Migration complete! All data is now live on Firebase.\x1b[0m');
  } catch (error) {
    console.error('\x1b[31mMigration failed:\x1b[0m', error.message);
    process.exit(1);
  }
}

run();
