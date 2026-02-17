
const fs = require('fs');
const outFile = process.argv[2];
console.log('Writing to:', outFile);
try {
    fs.writeFileSync(outFile, 'Node is working and can write to artifact dir!');
} catch (err) {
    console.error('Failed to write:', err);
}
