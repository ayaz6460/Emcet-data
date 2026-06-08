const fs = require('fs');
const path = require('path');

const CSV_PATH = path.join(__dirname, 'cse_students_2015_2025.csv');
const OUT_DIR  = path.join(__dirname, 'students_by_year');

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR);

console.log('Reading CSV...');
const raw = fs.readFileSync(CSV_PATH, 'utf-8');
const lines = raw.split('\n');
const header = lines[0].split(',');

const iYear     = header.indexOf('year');
const iCode     = header.indexOf('college_code');
const iRollno   = header.indexOf('rollno');
const iRank     = header.indexOf('rank');
const iName     = header.indexOf('cand_name');
const iGender   = header.indexOf('gender');
const iRegion   = header.indexOf('region');
const iCategory = header.indexOf('category');
const iSeatCat  = header.indexOf('seat_category');

// Map: year -> college_code -> [students]
const byYear = new Map();

console.log(`Processing ${lines.length - 1} records...`);

for (let i = 1; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;
  const c = line.split(',');
  if (c.length < 9) continue;

  const year = c[iYear]?.trim();
  const code = c[iCode]?.trim();
  const rank = parseInt(c[iRank], 10);
  if (!year || !code || isNaN(rank)) continue;

  if (!byYear.has(year)) byYear.set(year, new Map());
  const byCollege = byYear.get(year);
  if (!byCollege.has(code)) byCollege.set(code, []);

  byCollege.get(code).push({
    rollno:    c[iRollno]?.trim()   || '',
    rank,
    name:      c[iName]?.trim()     || '',
    gender:    c[iGender]?.trim()   || '',
    region:    c[iRegion]?.trim()   || '',
    category:  c[iCategory]?.trim() || '',
    seat_cat:  c[iSeatCat]?.trim()  || '',
  });
}

// Write one file per year
for (const [year, byCollege] of byYear.entries()) {
  const obj = {};
  for (const [code, students] of byCollege.entries()) {
    // Sort by rank ascending
    students.sort((a, b) => a.rank - b.rank);
    obj[code] = students;
  }
  const filePath = path.join(OUT_DIR, `${year}.json`);
  fs.writeFileSync(filePath, JSON.stringify(obj));
  const kb = (fs.statSync(filePath).size / 1024).toFixed(1);
  console.log(`  ✓ ${year}.json  (${Object.keys(obj).length} colleges, ${kb} KB)`);
}

console.log('\nDone! Files written to:', OUT_DIR);
