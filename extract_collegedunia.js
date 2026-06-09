const fs = require('fs');

const data = JSON.parse(fs.readFileSync('next_data.json', 'utf8'));
const listingResponse = data.props?.initialProps?.pageProps?.listingResponse;

if (!listingResponse) {
  console.error('listingResponse not found!');
  process.exit(1);
}

console.log('listingResponse keys:', Object.keys(listingResponse));

// Look for arrays that might contain colleges
for (const [key, val] of Object.entries(listingResponse)) {
  if (Array.isArray(val)) {
    console.log(`Found array key: "${key}" of length ${val.length}`);
    if (val.length > 0) {
      console.log('Sample element keys:', Object.keys(val[0] || {}));
      console.log('Sample element:', JSON.stringify(val[0]).slice(0, 400));
    }
  }
}
