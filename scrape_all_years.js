const fs = require('fs').promises;
const path = require('path');

const YEARS = ['2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024'];
const BRANCH = 'CSE';
const CONCURRENCY = 6;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

// Helper function to delay execution
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Helper function to escape CSV fields
function escapeCSV(val) {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

// Fetch helper with retries and exponential backoff
async function fetchWithRetry(url, options = {}, retries = MAX_RETRIES, delay = RETRY_DELAY_MS) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'application/json, text/javascript, */*; q=0.01',
                    'Referer': 'https://eduvale.in/eapcet-college-wise-allotment/',
                    ...options.headers
                },
                ...options
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            return response;
        } catch (error) {
            console.warn(`[Attempt ${i + 1}/${retries}] Failed to fetch ${url}: ${error.message}`);
            if (i === retries - 1) throw error;
            await sleep(delay * Math.pow(2, i));
        }
    }
}

// Concurrency pool runner
async function asyncPool(poolLimit, array, iteratorFn) {
    const ret = [];
    const executing = [];
    for (const item of array) {
        const p = Promise.resolve().then(() => iteratorFn(item));
        ret.push(p);
        if (poolLimit <= array.length) {
            const e = p.then(() => executing.splice(executing.indexOf(e), 1));
            executing.push(e);
            if (executing.length >= poolLimit) {
                await Promise.race(executing);
            }
        }
    }
    return Promise.all(ret);
}

// Save dataset to JSON and CSV helper
async function saveDataset(records, jsonPath, csvPath) {
    // 1. Save JSON
    await fs.writeFile(jsonPath, JSON.stringify(records, null, 2), 'utf-8');
    
    // 2. Save CSV
    const headers = ['year', 'college_code', 'college_name', 'rollno', 'rank', 'cand_name', 'gender', 'region', 'category', 'seat_category'];
    const csvRows = [headers.join(',')];
    
    for (const s of records) {
        const row = [
            escapeCSV(s.year),
            escapeCSV(s.college_code),
            escapeCSV(s.college_name),
            escapeCSV(s.rollno),
            escapeCSV(s.rank),
            escapeCSV(s.cand_name),
            escapeCSV(s.gender),
            escapeCSV(s.region),
            escapeCSV(s.category),
            escapeCSV(s.seat_category)
        ];
        csvRows.push(row.join(','));
    }
    
    await fs.writeFile(csvPath, csvRows.join('\n'), 'utf-8');
}

async function scrapeYear(year, yearsDir) {
    console.log(`\n========================================`);
    console.log(`Scraping Year: ${year} for Branch: ${BRANCH}...`);
    console.log(`========================================`);
    
    // 1. Fetch colleges list for this year
    const collegesUrl = `https://eduvale.in/eapcet-college-wise-allotment/fetch_colleges.php?year=${year}`;
    console.log(`Fetching colleges list from: ${collegesUrl}`);
    const response = await fetchWithRetry(collegesUrl);
    const html = await response.text();
    
    // 2. Parse option tags
    const optionRegex = /<option\s+value=['"]([^'"]+)['"]>(.*?)<\/option>/gi;
    const colleges = [];
    let match;
    while ((match = optionRegex.exec(html)) !== null) {
        const code = match[1].trim();
        const name = match[2].trim();
        if (code) {
            colleges.push({ code, name });
        }
    }
    
    console.log(`Found ${colleges.length} colleges for Year ${year}.`);
    
    if (colleges.length === 0) {
        console.warn(`No colleges found for Year ${year}. Skipping.`);
        return [];
    }
    
    const yearStudents = [];
    let completedCount = 0;
    
    // 3. Define the iterator function to fetch student results for a college
    const fetchCollegeData = async (college) => {
        const cacheBuster = Date.now();
        const url = `https://eduvale.in/eapcet-college-wise-allotment/fetch_results.php?year=${year}&college=${encodeURIComponent(college.code)}&branch=${BRANCH}&_=${cacheBuster}`;
        
        try {
            const res = await fetchWithRetry(url);
            const json = await res.json();
            
            let count = 0;
            if (json && Array.isArray(json.data)) {
                for (const student of json.data) {
                    yearStudents.push({
                        year: year,
                        college_code: college.code,
                        college_name: college.name,
                        rollno: student.rollno || '',
                        rank: student.rank ? Number(student.rank) : null,
                        cand_name: student.cand_name || '',
                        gender: student.gender || '',
                        region: student.region || '',
                        category: student.category || '',
                        seat_category: student.seat_category || ''
                    });
                    count++;
                }
            }
            
            completedCount++;
            if (completedCount % 20 === 0 || completedCount === colleges.length) {
                console.log(`[Year ${year}] Progress: ${completedCount}/${colleges.length} colleges processed.`);
            }
        } catch (error) {
            completedCount++;
            console.error(`[Year ${year}] Failed to fetch ${college.code} (${college.name}): ${error.message}`);
        }
    };
    
    // 4. Run the fetches concurrently
    await asyncPool(CONCURRENCY, colleges, fetchCollegeData);
    
    console.log(`Year ${year} complete. Total students: ${yearStudents.length}`);
    
    // 5. Save individual year dataset
    if (yearStudents.length > 0) {
        const jsonPath = path.join(yearsDir, `cse_students_${year}.json`);
        const csvPath = path.join(yearsDir, `cse_students_${year}.csv`);
        await saveDataset(yearStudents, jsonPath, csvPath);
        console.log(`Saved Year ${year} files to:`);
        console.log(`  JSON: ${jsonPath}`);
        console.log(`  CSV:  ${csvPath}`);
    }
    
    return yearStudents;
}

async function main() {
    try {
        const start = Date.now();
        const outputDir = __dirname;
        const yearsDir = path.join(outputDir, 'years');
        
        // Ensure years directory exists
        await fs.mkdir(yearsDir, { recursive: true });
        
        let masterStudents = [];
        
        // Process each year sequentially
        for (const year of YEARS) {
            const yearData = await scrapeYear(year, yearsDir);
            masterStudents = masterStudents.concat(yearData);
        }
        
        console.log(`\n========================================`);
        console.log(`All years processed! Combining data...`);
        console.log(`Total records collected: ${masterStudents.length}`);
        
        // Save combined master files
        const masterJsonPath = path.join(outputDir, 'cse_students_2015_2024.json');
        const masterCsvPath = path.join(outputDir, 'cse_students_2015_2024.csv');
        
        console.log('Saving combined master files...');
        await saveDataset(masterStudents, masterJsonPath, masterCsvPath);
        console.log(`Saved Combined Master JSON to ${masterJsonPath}`);
        console.log(`Saved Combined Master CSV to ${masterCsvPath}`);
        
        const duration = ((Date.now() - start) / 1000).toFixed(1);
        console.log(`Scrape job finished in ${duration} seconds.`);
        
    } catch (error) {
        console.error('Fatal error in main script execution:', error);
    }
}

main();
