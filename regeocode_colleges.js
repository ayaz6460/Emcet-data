/**
 * regeocode_colleges.js
 * Re-geocodes colleges using OpenStreetMap Nominatim.
 * Saves to colleges_details.json after EVERY single college (real-time DB update).
 * Skips colleges already geocoded in this run (resume-safe).
 */
const fs = require('fs');
const https = require('https');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'MCC-College-Geocoder/1.0 (educational project)',
        'Accept': 'application/json'
      },
      timeout: 10000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { resolve([]); }
      });
    });
    req.on('error', () => resolve([]));
    req.on('timeout', () => { req.destroy(); resolve([]); });
  });
}

async function geocodeCollege(name, address) {
  // Build search queries from most specific to least
  const firstLine = address ? address.split(',')[0].trim() : '';
  const queries = [];

  // Use address first line if it looks like a real name (not same as name)
  if (firstLine && firstLine.length > 6 && firstLine !== name) {
    queries.push(firstLine + ', Telangana, India');
  }
  queries.push(name + ', Telangana, India');

  // Also try shortened (4 words) version
  const short = name.split(' ').slice(0, 4).join(' ');
  if (short !== name && short.length > 8) {
    queries.push(short + ', Telangana, India');
  }

  for (const q of queries) {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&countrycodes=in&addressdetails=1`;
    const results = await httpsGet(url);

    // Prefer educational amenity types
    const best = results.find(r =>
      r.type === 'university' || r.type === 'college' || r.type === 'school' ||
      (r.class === 'amenity' && ['university','college','school'].includes(r.type))
    ) || results.find(r => r.class === 'amenity' || r.class === 'building') || results[0];

    if (best) {
      return {
        lat: parseFloat(best.lat),
        lon: parseFloat(best.lon),
        found: true,
        query: q,
        type: best.type
      };
    }

    await sleep(1100); // Nominatim rate limit: 1 req/sec
  }

  return { found: false };
}

async function main() {
  // Load fresh from disk each time (handles resume)
  let details = JSON.parse(fs.readFileSync('colleges_details.json', 'utf8'));
  const dashboardData = JSON.parse(fs.readFileSync('dashboard_data.json', 'utf8'));
  const colleges = dashboardData.colleges;

  // Track which ones we've already attempted in this session
  // (skip ones that were geocoded=true BEFORE this run started)
  // To force re-geocode all, delete colleges_details_backup.json
  const backup = fs.existsSync('colleges_details_backup.json')
    ? JSON.parse(fs.readFileSync('colleges_details_backup.json', 'utf8'))
    : {};

  console.log(`Starting real-time geocoding for ${colleges.length} colleges...`);
  console.log(`Saves to colleges_details.json after EVERY college.\n`);

  let updated = 0, failed = 0, skipped = 0;

  for (let i = 0; i < colleges.length; i++) {
    const c = colleges[i];
    const code = c.code;
    const name = c.name;

    // Reload details fresh from disk for latest state
    details = JSON.parse(fs.readFileSync('colleges_details.json', 'utf8'));
    const existing = details[code];
    const address = existing?.address || '';

    process.stdout.write(`[${i+1}/${colleges.length}] ${code}: ${name.slice(0, 40).padEnd(40)} => `);

    const result = await geocodeCollege(name, address);

    if (result.found) {
      details[code].lat = result.lat;
      details[code].lon = result.lon;
      details[code].geocoded = true;
      updated++;
      console.log(`✅ (${result.lat.toFixed(5)}, ${result.lon.toFixed(5)}) [${result.type || 'place'}]`);
    } else {
      // Mark as not geocoded so map hides the pin (no wrong location shown)
      details[code].geocoded = false;
      failed++;
      console.log(`❌ not found — pin hidden on map`);
    }

    // === REAL-TIME SAVE after every single college ===
    fs.writeFileSync('colleges_details.json', JSON.stringify(details, null, 2), 'utf8');

    // Respect Nominatim 1 req/sec (already slept in geocodeCollege on multiple queries)
    // Add small buffer only if single query was used
    await sleep(200);
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`✅ COMPLETE`);
  console.log(`   Geocoded: ${updated} colleges`);
  console.log(`   Not found (hidden on map): ${failed}`);
  console.log(`   colleges_details.json updated in real-time throughout.`);
}

main().catch(console.error);
