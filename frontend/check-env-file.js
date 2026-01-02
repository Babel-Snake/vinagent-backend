const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const envPath = path.join(__dirname, '.env.local');

console.log(`Checking path: ${envPath}`);

if (!fs.existsSync(envPath)) {
    console.error('ERROR: .env.local does not exist!');
    process.exit(1);
}

const envConfig = dotenv.parse(fs.readFileSync(envPath));

console.log('Parsed .env.local keys:');
Object.keys(envConfig).forEach(key => {
    const val = envConfig[key];
    const masked = val ? val.substring(0, 5) + '...' : 'EMPTY';
    console.log(`${key}: ${masked}`);
});

if (envConfig.NEXT_PUBLIC_FIREBASE_API_KEY) {
    console.log('\nSUCCESS: API Key found in file.');
} else {
    console.error('\nFAILURE: API Key NOT found in file.');
}
