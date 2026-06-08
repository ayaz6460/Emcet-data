const fs = require('fs').promises;
const path = require('path');

const PHASES = ['2025_1_PHASE', '2025_2_PHASE', '2025_FINAL_PHASE'];
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

async function scrapePhase(phase, yearsDir) {
    console.log(`\n========================================`);
    console.log(`Scraping 2025 Phase: ${phase} for Branch: ${BRANCH}...`);
    console.log(`========================================`);
    
    // 1. Fetch colleges list for this phase
    const collegesUrl = `https://eduvale.in/eapcet-college-wise-allotment/fetch_colleges.php?year=${phase}`;
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
    
    console.log(`Found ${colleges.length} colleges for Phase ${phase}.`);
    
    if (colleges.length === 0) {
        console.warn(`No colleges found for Phase ${phase}. Skipping.`);
        return [];
    }
    
    const phaseStudents = [];
    let completedCount = 0;
    
    // 3. Define the iterator function to fetch student results for a college
    const fetchCollegeData = async (college) => {
        const cacheBuster = Date.now();
        const url = `https://eduvale.in/eapcet-college-wise-allotment/fetch_results.php?year=${phase}&college=${encodeURIComponent(college.code)}&branch=${BRANCH}&_=${cacheBuster}`;
        
        try {
            const res = await fetchWithRetry(url);
            const json = await res.json();
            
            let count = 0;
            if (json && Array.isArray(json.data)) {
                for (const student of json.data) {
                    phaseStudents.push({
                        year: phase, // Save the phase name directly in the year column for ease of filtering
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
                console.log(`[Phase ${phase}] Progress: ${completedCount}/${colleges.length} colleges processed.`);
            }
        } catch (error) {
            completedCount++;
            console.error(`[Phase ${phase}] Failed to fetch ${college.code} (${college.name}): ${error.message}`);
        }
    };
    
    // 4. Run the fetches concurrently
    await asyncPool(CONCURRENCY, colleges, fetchCollegeData);
    
    console.log(`Phase ${phase} complete. Total students: ${phaseStudents.length}`);
    
    // 5. Save individual phase dataset in years/ directory
    if (phaseStudents.length > 0) {
        const jsonPath = path.join(yearsDir, `cse_students_${phase}.json`);
        const csvPath = path.join(yearsDir, `cse_students_${phase}.csv`);
        await saveDataset(phaseStudents, jsonPath, csvPath);
        console.log(`Saved Phase ${phase} files to:`);
        console.log(`  JSON: ${jsonPath}`);
        console.log(`  CSV:  ${csvPath}`);
    }
    
    return phaseStudents;
}

async function main() {
    try {
        const start = Date.now();
        const outputDir = __dirname;
        const yearsDir = path.join(outputDir, 'years');
        
        // Ensure years directory exists
        await fs.mkdir(yearsDir, { recursive: true });
        
        let all2025Students = [];
        
        // 1. Process each 2025 phase sequentially
        for (const phase of PHASES) {
            const phaseData = await scrapePhase(phase, yearsDir);
            all2025Students = all2025Students.concat(phaseData);
        }
        
        console.log(`\n========================================`);
        console.log(`All 2025 phases processed!`);
        console.log(`Total 2025 records collected: ${all2025Students.length}`);
        
        // 2. Save 2025 combined master files
        const combined2025JsonPath = path.join(outputDir, 'cse_students_2025_all_phases.json');
        const combined2025CsvPath = path.join(outputDir, 'cse_students_2025_all_phases.csv');
        
        console.log('Saving 2025 combined master files...');
        await saveDataset(all2025Students, combined2025JsonPath, combined2025CsvPath);
        console.log(`Saved Combined 2025 JSON to ${combined2025JsonPath}`);
        console.log(`Saved Combined 2025 CSV to ${combined2025CsvPath}`);
        
        // 3. Compile the complete master file (2015 - 2025)
        console.log('\nAggregating with 2015-2024 dataset...');
        const path2015to2024 = path.join(outputDir, 'cse_students_2015_2024.json');
        let completeStudents = [];
        
        try {
            const content2015to2024 = await fs.readFile(path2015to2024, 'utf-8');
            completeStudents = JSON.parse(content2015to2024);
            console.log(`Successfully loaded ${completeStudents.length} records from 2015-2024 master JSON.`);
        } catch (readError) {
            console.warn(`Could not read 2015-2024 master JSON file: ${readError.message}`);
            console.warn('Will only output 2025 files.');
        }
        
        if (completeStudents.length > 0) {
            completeStudents = completeStudents.concat(all2025Students);
            const masterJsonPath = path.join(outputDir, 'cse_students_2015_2025.json');
            const masterCsvPath = path.join(outputDir, 'cse_students_2015_2025.csv');
            
            console.log(`Saving complete combined master (2015-2025) files...`);
            await saveDataset(completeStudents, masterJsonPath, masterCsvPath);
            console.log(`Saved Complete Master JSON to ${masterJsonPath}`);
            console.log(`Saved Complete Master CSV to ${masterCsvPath}`);
            console.log(`Total 2015-2025 records: ${completeStudents.length}`);
        }
        
        const duration = ((Date.now() - start) / 1000).toFixed(1);
        console.log(`2025 scrape job finished in ${duration} seconds.`);
        
    } catch (error) {
        console.error('Fatal error in main script execution:', error);
    }
}

main();
