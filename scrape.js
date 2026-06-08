const fs = require('fs').promises;
const path = require('path');

const YEAR = '2025_1_PHASE';
const BRANCH = 'CSE';
const CONCURRENCY = 5;
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

async function main() {
    try {
        console.log(`Starting scraper for Year: ${YEAR}, Branch: ${BRANCH}...`);
        
        // 1. Fetch the colleges list
        const collegesUrl = `https://eduvale.in/eapcet-college-wise-allotment/fetch_colleges.php?year=${YEAR}`;
        console.log(`Fetching colleges list from: ${collegesUrl}`);
        const response = await fetchWithRetry(collegesUrl);
        const html = await response.text();
        
        // 2. Parse the options from HTML using RegExp
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
        
        console.log(`Found ${colleges.length} colleges.`);
        
        if (colleges.length === 0) {
            console.error('No colleges found. Please check the website response.');
            return;
        }
        
        const allStudents = [];
        let completedCount = 0;
        
        // 3. Define the iterator function to fetch student results for a college
        const fetchCollegeData = async (college) => {
            const cacheBuster = Date.now();
            const url = `https://eduvale.in/eapcet-college-wise-allotment/fetch_results.php?year=${YEAR}&college=${encodeURIComponent(college.code)}&branch=${BRANCH}&_=${cacheBuster}`;
            
            try {
                const res = await fetchWithRetry(url);
                const json = await res.json();
                
                let count = 0;
                if (json && Array.isArray(json.data)) {
                    for (const student of json.data) {
                        allStudents.push({
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
                console.log(`[${completedCount}/${colleges.length}] Successfully processed ${college.code} (${college.name}) - Fetched ${count} students`);
            } catch (error) {
                completedCount++;
                console.error(`[${completedCount}/${colleges.length}] Failed to process ${college.code} (${college.name}): ${error.message}`);
            }
        };
        
        // 4. Run the fetches concurrently
        await asyncPool(CONCURRENCY, colleges, fetchCollegeData);
        
        console.log(`Finished fetching data. Total students collected: ${allStudents.length}`);
        
        // 5. Save output as JSON
        const jsonPath = path.join(__dirname, 'cse_students_all_colleges.json');
        await fs.writeFile(jsonPath, JSON.stringify(allStudents, null, 2), 'utf-8');
        console.log(`Saved JSON data to ${jsonPath}`);
        
        // 6. Save output as CSV
        const csvPath = path.join(__dirname, 'cse_students_all_colleges.csv');
        const headers = ['college_code', 'college_name', 'rollno', 'rank', 'cand_name', 'gender', 'region', 'category', 'seat_category'];
        const csvRows = [headers.join(',')];
        
        for (const s of allStudents) {
            const row = [
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
        console.log(`Saved CSV data to ${csvPath}`);
        
    } catch (error) {
        console.error('An error occurred during execution:', error);
    }
}

main();
