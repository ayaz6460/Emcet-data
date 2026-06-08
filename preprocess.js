const fs = require('fs');
const path = require('path');

const CSV_PATH = path.join(__dirname, 'cse_students_2015_2025.csv');
const OUT_PATH = path.join(__dirname, 'dashboard_data.json');

console.log('Reading CSV file...');
const raw = fs.readFileSync(CSV_PATH, 'utf-8');
const lines = raw.split('\n');
const header = lines[0].split(',');

// Indices
const iYear    = header.indexOf('year');
const iCode    = header.indexOf('college_code');
const iName    = header.indexOf('college_name');
const iRank    = header.indexOf('rank');

// Map: "year|college_code" -> { year, college_code, college_name, min_rank, max_rank, count }
const map = new Map();

console.log(`Processing ${lines.length - 1} records...`);

for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Simple CSV split (handles no quoted commas in our data)
    const cols = line.split(',');
    if (cols.length < 6) continue;

    const year  = cols[iYear]  ? cols[iYear].trim()  : '';
    const code  = cols[iCode]  ? cols[iCode].trim()  : '';
    const name  = cols[iName]  ? cols[iName].trim()  : '';
    const rank  = parseInt(cols[iRank], 10);

    if (!year || !code || isNaN(rank)) continue;

    const key = `${year}|${code}`;
    if (!map.has(key)) {
        map.set(key, { year, college_code: code, college_name: name, opening_rank: rank, closing_rank: rank, total_students: 1 });
    } else {
        const entry = map.get(key);
        if (rank < entry.opening_rank) entry.opening_rank = rank;
        if (rank > entry.closing_rank) entry.closing_rank = rank;
        entry.total_students++;
    }
}

const result = Array.from(map.values());

// Sort for convenience
result.sort((a, b) => {
    if (a.year < b.year) return -1;
    if (a.year > b.year) return 1;
    return a.college_name.localeCompare(b.college_name);
});

// Collect unique years and colleges
const years    = [...new Set(result.map(r => r.year))].sort();
const colleges = [...new Map(result.map(r => [r.college_code, r.college_name])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([code, name]) => ({ code, name }));

const output = { years, colleges, data: result };

fs.writeFileSync(OUT_PATH, JSON.stringify(output), 'utf-8');
console.log(`Done! ${result.length} summary records written to ${OUT_PATH}`);
console.log(`Years: ${years.length}, Colleges: ${colleges.length}`);
