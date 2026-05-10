const fs = require("fs");

const targetFile = "data/students.js";
const code = fs.readFileSync(targetFile, "utf8");

// Find the STUDENTS array
const startIdx = code.indexOf("const STUDENTS = [");
if (startIdx === -1) throw new Error("Could not find STUDENTS array");

// Extract the array string by matching braces
let depth = 0;
let arrayStart = code.indexOf("[", startIdx);
let arrayEnd = -1;

for (let i = arrayStart; i < code.length; i++) {
  if (code[i] === "[") depth++;
  else if (code[i] === "]") {
    depth--;
    if (depth === 0) {
      arrayEnd = i;
      break;
    }
  }
}

const arrayStr = code.substring(arrayStart, arrayEnd + 1);

// This function uses eval to get the array safely since it's just JS object notation
const students = eval(arrayStr);

// Keep the first 3 students exactly as they are
const firstThree = students.slice(0, 3);
// Sort the rest alphabetically
const rest = students.slice(3);
rest.sort((a, b) => a.name.localeCompare(b.name));

// Combine them back
const sortedStudents = [...firstThree, ...rest];

// Re-stringify the array manually to keep formatting
function stringifyStudent(s) {
  let out = "  {\n";
  out += `    name: "${s.name}",\n`;
  out += `    photo: ${s.photo ? '"' + s.photo + '"' : "null"},\n`;

  if (Array.isArray(s.track)) {
    out += `    track: [${s.track.map((t) => '"' + t + '"').join(", ")}],\n`;
  } else {
    out += `    track: "${s.track}",\n`;
  }

  if (s.color) out += `    color: "${s.color}",\n`;
  if (s.gender) out += `    gender: "${s.gender}",\n`;
  if (s.teamLeader) out += `    teamLeader: ${s.teamLeader},\n`;

  out += "    social: {\n";
  if (s.social) {
    for (const [k, v] of Object.entries(s.social)) {
      out += `      ${k}: "${v}",\n`;
    }
  }
  out += "    },\n";
  out += "  }";
  return out;
}

const newArrayStr =
  "[\n" + sortedStudents.map(stringifyStudent).join(",\n") + "\n]";

const newCode =
  code.substring(0, arrayStart) + newArrayStr + code.substring(arrayEnd + 1);

fs.writeFileSync(targetFile, newCode, "utf8");
console.log(
  "Sorted successfully! The first three students were kept in their original positions.",
);
