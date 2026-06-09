const fs = require('fs');

const data = JSON.parse(fs.readFileSync('next_data.json', 'utf8'));
const str = JSON.stringify(data);

// Search for anything with api or url
const regex = /\"(https?:\/\/[^\"]+)\"/g;
let match;
const urls = [];
while ((match = regex.exec(str)) !== null) {
  const url = match[1];
  if (url.includes('api') || url.includes('ajax') || url.includes('stream') || url.includes('collegedunia')) {
    urls.push(url);
  }
}

console.log(`Found ${urls.length} URLs:`);
urls.slice(0, 30).forEach(u => console.log(' -', u));
