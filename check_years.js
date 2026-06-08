async function main() {
    try {
        const url = 'https://eduvale.in/eapcet-college-wise-allotment/';
        console.log(`Fetching main page: ${url}`);
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
            }
        });
        const html = await res.text();
        
        // Find select elements or options for years
        const selectRegex = /<select[^>]*name=["']year["'][^>]*>([\s\S]*?)<\/select>/gi;
        const match = selectRegex.exec(html);
        if (match) {
            console.log('Found Year dropdown options:');
            const optionsHtml = match[1];
            const optionRegex = /<option\s+value=['"]([^'"]+)['"]>(.*?)<\/option>/gi;
            let optMatch;
            while ((optMatch = optionRegex.exec(optionsHtml)) !== null) {
                console.log(`- Value: "${optMatch[1]}", Text: "${optMatch[2].trim()}"`);
            }
        } else {
            console.log('Year dropdown not found directly. Let us search for any option elements with year patterns.');
            const anyOptionRegex = /<option\s+value=['"]([^'"]*\d{4}[^'"]*)['"]>(.*?)<\/option>/gi;
            let optMatch;
            let count = 0;
            while ((optMatch = anyOptionRegex.exec(html)) !== null && count < 30) {
                console.log(`Option - Value: "${optMatch[1]}", Text: "${optMatch[2].trim()}"`);
                count++;
            }
        }
    } catch (e) {
        console.error(e);
    }
}
main();
