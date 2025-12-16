console.log('1. Starting test-imports...');
try {
    require('dotenv').config();
    console.log('2. Dotenv loaded.');
} catch (e) { console.error('Error loading dotenv', e); }

try {
    const admin = require('../src/config/firebase');
    console.log('3. Firebase loaded.');
} catch (e) { console.error('Error loading Firebase', e); }

try {
    const { User } = require('../src/models');
    console.log('4. Models loaded.');
} catch (e) { console.error('Error loading Models', e); }

console.log('5. Done.');
