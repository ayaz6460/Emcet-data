const fs = require('fs');

// Helper to normalize college names for robust matching
function normalize(name) {
  if (!name) return '';
  return name.toLowerCase()
    .replace(/['"&,.\-\(\)\[\]]/g, '') // remove punctuation
    .replace(/\s+/g, '') // remove spaces
    .replace(/colleges?/gi, '')
    .replace(/engineering/gi, '')
    .replace(/technolog(y|ical|ies)/gi, '')
    .replace(/institutes?/gi, '')
    .replace(/sciences?/gi, '')
    .replace(/\band\b/gi, '')
    .replace(/\bof\b/gi, '')
    .replace(/\bfor\b/gi, '')
    .replace(/\bthe\b/gi, '')
    .replace(/\bwomen\b/gi, '')
    .replace(/\bwomens\b/gi, '')
    .replace(/\bautonomous\b/gi, '')
    .replace(/\buniversity\b/gi, '')
    .replace(/\bvjiet\b/gi, 'vjiet') // keep specific abbreviations
    .trim();
}

// Extract a compact name from an address like "ABC COLLEGE OF ENGINEERING, Hyderabad, Telangana, India"
function nameFromAddress(address) {
  if (!address) return '';
  // Take everything before the first comma
  const parts = address.split(',');
  return parts[0].trim();
}

function main() {
  const details = JSON.parse(fs.readFileSync('colleges_details.json', 'utf8'));
  const dashboardData = JSON.parse(fs.readFileSync('dashboard_data.json', 'utf8'));
  const scraped = JSON.parse(fs.readFileSync('collegedunia_ratings.json', 'utf8'));

  const colleges = dashboardData.colleges;
  console.log(`Matching ${colleges.length} colleges from dashboard_data...`);

  let matchCount = 0;
  let skippedCount = 0;
  const unmatched = [];

  // Build index: normalized full name => data
  const scrapedIndex = {};
  Object.entries(scraped).forEach(([fullName, data]) => {
    // Index by full name
    const norm = normalize(fullName);
    if (norm) scrapedIndex[norm] = { ...data, _originalName: fullName };

    // Index by shortName
    if (data.shortName) {
      const normShort = normalize(data.shortName);
      if (normShort && normShort.length >= 3) {
        scrapedIndex[normShort] = { ...data, _originalName: fullName };
      }
    }
  });

  // Helper: try to find a match in the scrapedIndex for a given raw name
  function findMatch(rawName) {
    if (!rawName) return null;

    const normName = normalize(rawName);
    if (!normName) return null;

    // 1. Exact normalized match
    if (scrapedIndex[normName]) return scrapedIndex[normName];

    // 2. Substring match (our name includes scraped key, or vice versa)
    const keys = Object.keys(scrapedIndex);
    const found = keys.find(k => {
      if (k.length < 4) return false; // skip tiny keys to avoid false positives
      return normName.includes(k) || k.includes(normName);
    });
    if (found) return scrapedIndex[found];

    return null;
  }

  colleges.forEach(c => {
    const code = c.code;
    const collegeName = c.name;

    // Also try matching via existing address in details (in case dashboard doesn't have full name)
    const addressName = nameFromAddress(details[code]?.address);

    // Try primary match using college name from dashboard_data
    let match = findMatch(collegeName);

    // Fallback: try matching via address-derived name
    if (!match && addressName && addressName !== collegeName) {
      match = findMatch(addressName);
    }

    if (match && match.rating) {
      // Only update rating/reviews — don't touch coordinates or geocoded flag
      details[code].rating = match.rating;
      details[code].reviews = match.reviews || 0;
      details[code].ratingSource = 'collegedunia';

      // Update address with city only if our address is generic/missing
      if (match.city && details[code].address &&
          details[code].address.endsWith(', Hyderabad, Telangana, India') &&
          match.city !== 'Hyderabad') {
        // keep address as is — only update if city is different
        // (don't override good addresses)
      }

      matchCount++;
      if (matchCount <= 5) {
        console.log(`  ✓ ${code}: "${collegeName}" => ${match.rating} ⭐ (from: ${match._originalName})`);
      }
    } else {
      // DO NOT touch existing rating — leave it as-is (null or whatever was set before)
      skippedCount++;
      unmatched.push(`${code}: ${collegeName}`);
    }
  });

  // Write updated details back
  fs.writeFileSync('colleges_details.json', JSON.stringify(details, null, 2), 'utf8');

  console.log(`\n✅ Matching completed!`);
  console.log(`   Matched & updated: ${matchCount} / ${colleges.length}`);
  console.log(`   Not matched (ratings preserved as-is): ${skippedCount}`);
  console.log('\nUnmatched colleges (their existing ratings are kept, not cleared):');
  unmatched.forEach(u => console.log(` - ${u}`));
}

main();
