const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env.local');
const logPath = path.join(__dirname, 'env-debug.log');
const logStream = fs.createWriteStream(logPath, { flags: 'w' });

function log(msg) {
    console.log(msg);
    logStream.write(msg + '\n');
}

console.log(`Checking path: ${envPath}`);

if (!fs.existsSync(envPath)) {
    log('ERROR: .env.local does not exist!');
    process.exit(1);
}

try {
    const content = fs.readFileSync(envPath); // Read as buffer first
    log(`File read. Bytes: ${content.length}`);

    // Check for UTF-16 LE BOM (Common in Windows)
    if (content[0] === 0xFF && content[1] === 0xFE) {
        log('WARNING: File appears to be UTF-16 LE (BOM detected). Next.js might not read this.');
    }

    // Check for UTF-8 BOM
    if (content[0] === 0xEF && content[1] === 0xBB && content[2] === 0xBF) {
        log('INFO: File has UTF-8 BOM.');
    }

    const text = content.toString('utf8');
    const lines = text.split('\n');
    log(`Lines found: ${lines.length}`);

    let keyFound = false;
    lines.forEach(line => {
        // Clean line to handle potential \r
        const cleanLine = line.trim();
        if (cleanLine.includes('NEXT_PUBLIC_FIREBASE_API_KEY')) {
            keyFound = true;
            log(`Key found in line: [${cleanLine}]`);
            const parts = cleanLine.split('=');
            if (parts.length > 1) {
                log(`Value length: ${parts[1].trim().length}`);
                log(`Value start: ${parts[1].trim().substring(0, 5)}`);
            }
        }
    });

    if (!keyFound) {
        log('FAILURE: NEXT_PUBLIC_FIREBASE_API_KEY literal string not found in file.');
    }

    logStream.end();

} catch (e) {
    console.error('Error:', e.message);
    fs.writeFileSync(logPath, `Error: ${e.message}`);
}
