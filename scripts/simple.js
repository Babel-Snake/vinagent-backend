const fs = require('fs');
console.log('Hello from simple.js');
try {
    fs.writeFileSync('simple_output.txt', 'It works!');
    console.log('File written.');
} catch (e) {
    console.error('Write failed:', e);
}
