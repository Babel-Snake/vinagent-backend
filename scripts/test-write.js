const fs = require('fs');
const path = require('path');
const target = 'C:/Users/pc/.gemini/antigravity/brain/eb4d4782-35ed-4df7-a78a-7d6a92189d34/test_output.txt';
try {
    fs.writeFileSync(target, 'Write successful');
} catch (e) {
    // try relative
    try {
        fs.writeFileSync('test_output_local.txt', 'Local write successful');
    } catch (e2) { }
}
