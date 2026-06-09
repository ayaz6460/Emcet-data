const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, 'dashboard_data.json');
const OUT_PATH = path.join(__dirname, 'colleges_details.json');

// Helper to delay execution
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Helper to clean college names for geocoding
function cleanName(name) {
  let cleaned = name.replace(/^["'\s]+|["'\s]+$/g, ''); // strip quotes
  cleaned = cleaned.replace(/\s+/g, ' '); // normalize spaces
  cleaned = cleaned.replace(/\(formerly\s+.*?\)/gi, ''); // remove (formerly ...)
  cleaned = cleaned.replace(/COLLGE/g, 'COLLEGE'); // fix common typos
  cleaned = cleaned.replace(/AND SCI$/g, 'AND SCIENCE'); // fix truncations
  cleaned = cleaned.replace(/ENGINEERINGAND/g, 'ENGINEERING AND'); // fix run-on AND
  return cleaned.trim();
}

async function main() {
  if (!fs.existsSync(DATA_PATH)) {
    console.error(`Error: ${DATA_PATH} not found.`);
    process.exit(1);
  }

  const json = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  const colleges = json.colleges;
  const allData = json.data;

  console.log(`Loaded ${colleges.length} colleges and ${allData.length} allotment records.`);

  // 1. Calculate the best opening rank for each college to generate realistic ratings
  const bestRanks = {};
  for (const entry of allData) {
    const code = entry.college_code;
    const rank = entry.opening_rank;
    if (!bestRanks[code] || rank < bestRanks[code]) {
      bestRanks[code] = rank;
    }
  }

  // 2. Load existing geocoded data to support resumption
  let details = {};
  if (fs.existsSync(OUT_PATH)) {
    try {
      details = JSON.parse(fs.readFileSync(OUT_PATH, 'utf8'));
      console.log(`Loaded ${Object.keys(details).length} existing college locations from cache.`);
    } catch (e) {
      console.warn('Could not parse existing output file, starting fresh.');
    }
  }

  let successCount = 0;
  let fallbackCount = 0;

  for (let i = 0; i < colleges.length; i++) {
    const c = colleges[i];
    const code = c.code;
    const originalName = c.name;
    const name = cleanName(originalName);

    // Skip if already geocoded
    if (details[code] && details[code].lat && details[code].lon) {
      continue;
    }

    console.log(`[${i + 1}/${colleges.length}] Geocoding ${code}: "${name}"...`);

    let lat = null;
    let lon = null;
    let address = null;
    let geocoded = false;

    // Try Query 1: Clean Name + Telangana, India
    try {
      const query = encodeURIComponent(`${name}, Telangana, India`);
      const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      });
      if (res.status === 200) {
        const data = await res.json();
        if (data && data[0]) {
          lat = parseFloat(data[0].lat);
          lon = parseFloat(data[0].lon);
          address = data[0].display_name;
          geocoded = true;
          successCount++;
          console.log(`  ✓ Found coordinates: ${lat}, ${lon}`);
        }
      } else {
        console.warn(`  ⚠️ Nominatim returned status code ${res.status}`);
      }
    } catch (err) {
      console.warn(`  ⚠️ Query 1 failed: ${err.message}`);
    }

    // Rate limit as per Nominatim guidelines (1.2 seconds)
    await sleep(1200);

    // Fallback if all geocoding attempts fail
    if (!geocoded) {
      fallbackCount++;
      // Hyderabad center (approx)
      const centerLat = 17.3850;
      const centerLon = 78.4867;
      // Spread them slightly so they don't overlap in the exact center
      const offsetLat = (Math.random() - 0.5) * 0.15;
      const offsetLon = (Math.random() - 0.5) * 0.15;
      lat = parseFloat((centerLat + offsetLat).toFixed(6));
      lon = parseFloat((centerLon + offsetLon).toFixed(6));
      address = `${name}, Hyderabad, Telangana, India`;
      console.log(`  ❌ Geocoding failed. Using fallback: ${lat}, ${lon}`);
    }

    details[code] = {
      lat,
      lon,
      address,
      rating: null,
      reviews: 0,
      geocoded
    };

    // Save progressively
    fs.writeFileSync(OUT_PATH, JSON.stringify(details, null, 2), 'utf8');
  }

  console.log(`\nGeocoding process finished.`);
  console.log(`Total geocoded: ${successCount}`);
  console.log(`Total fallbacks used: ${fallbackCount}`);
  console.log(`Results saved to: ${OUT_PATH}`);
}

main();
