async function testYear(year) {
    try {
        console.log(`\n--- Testing Year ${year} ---`);
        const collegesUrl = `https://eduvale.in/eapcet-college-wise-allotment/fetch_colleges.php?year=${year}`;
        const resColleges = await fetch(collegesUrl);
        const html = await resColleges.text();
        const optionRegex = /<option\s+value=['"]([^'"]+)['"]>(.*?)<\/option>/gi;
        const colleges = [];
        let match;
        while ((match = optionRegex.exec(html)) !== null) {
            colleges.push({ code: match[1], name: match[2] });
        }
        console.log(`Fetched colleges count for ${year}: ${colleges.length}`);
        if (colleges.length > 0) {
            const firstColl = colleges[0];
            const resultsUrl = `https://eduvale.in/eapcet-college-wise-allotment/fetch_results.php?year=${year}&college=${firstColl.code}&branch=CSE`;
            console.log(`Fetching results from: ${resultsUrl}`);
            const resResults = await fetch(resultsUrl);
            const resultsJson = await resResults.json();
            const studentCount = (resultsJson && resultsJson.data) ? resultsJson.data.length : 0;
            console.log(`Student count for ${firstColl.code} in ${year}: ${studentCount}`);
            if (studentCount > 0) {
                console.log('Sample student data:', JSON.stringify(resultsJson.data[0], null, 2));
            }
        }
    } catch (e) {
        console.error(`Error testing year ${year}:`, e.message);
    }
}

async function main() {
    await testYear('2024');
    await testYear('2015');
}
main();
