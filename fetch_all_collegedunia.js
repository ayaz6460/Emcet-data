const fs = require('fs');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchPage(page) {
  const url = `https://collegedunia.com/btech/telangana-colleges${page > 1 ? `?page=${page}` : ''}`;
  console.log(`Fetching page ${page}...`);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    if (!res.ok) {
      console.warn(`Failed to fetch page ${page}: status ${res.status}`);
      return [];
    }
    const html = await res.text();
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (!nextDataMatch) {
      console.warn(`No __NEXT_DATA__ found on page ${page}`);
      return [];
    }
    const nextData = JSON.parse(nextDataMatch[1].trim());
    const listingResponse = nextData.props?.initialProps?.pageProps?.listingResponse;
    if (!listingResponse) {
      console.warn(`No listingResponse on page ${page}`);
      return [];
    }
    
    const pageColleges = [];
    // Flatten colleges
    if (Array.isArray(listingResponse.colleges)) {
      listingResponse.colleges.forEach(group => {
        if (Array.isArray(group)) {
          pageColleges.push(...group);
        } else if (group && typeof group === 'object') {
          Object.values(group).forEach(c => pageColleges.push(c));
        }
      });
    }
    
    // Also check featured colleges
    if (Array.isArray(listingResponse.featured_colleges)) {
      listingResponse.featured_colleges.forEach(c => pageColleges.push(c));
    }
    
    console.log(`Found ${pageColleges.length} colleges on page ${page}`);
    return pageColleges;
  } catch (err) {
    console.error(`Error on page ${page}:`, err.message);
    return [];
  }
}

async function main() {
  const allColleges = [];
  // Fetch pages 1 to 20 to cover all 218 colleges
  for (let page = 1; page <= 20; page++) {
    const cols = await fetchPage(page);
    if (cols.length === 0 && page > 1) {
      // If a page returns absolutely nothing, we can break early
      console.log(`Page ${page} returned no colleges. Stopping fetch.`);
      break;
    }
    allColleges.push(...cols);
    await sleep(2000); // 2 seconds delay to avoid rate limiting
  }

  console.log(`\nTotal colleges fetched: ${allColleges.length}`);
  
  // Dedup and extract
  const compiled = {};
  allColleges.forEach(c => {
    if (!c || !c.college_name) return;
    const name = c.college_name.trim();
    const short = c.college_short_form || name;
    
    const avgRating = c.reviewsData?.avgRating || c.reviews_avg_rating?.avg_total || null;
    const reviewsCountStr = c.reviewsData?.reviewsCount || c.reviews_avg_rating?.review_count || '0';
    const reviewsCount = parseInt(reviewsCountStr.toString().replace(/,/g, ''), 10) || 0;
    
    compiled[name.toLowerCase()] = {
      name: name,
      shortName: short,
      rating: avgRating ? parseFloat(avgRating) : null,
      reviews: reviewsCount,
      fees: c.fees?.[0]?.fee || null,
      city: c.college_city || null
    };
  });

  fs.writeFileSync('collegedunia_ratings.json', JSON.stringify(compiled, null, 2), 'utf8');
  console.log(`Saved ${Object.keys(compiled).length} unique colleges to collegedunia_ratings.json`);
}

main();
