// jest.config.js
module.exports = {
    testEnvironment: 'node',
    testPathIgnorePatterns: ['/node_modules/', '/frontend/.next/'],
    modulePathIgnorePatterns: ['<rootDir>/frontend/.next/'],
    collectCoverageFrom: [
        'src/**/*.js',
        '!src/tests/**',
        '!src/config/serviceAccountKey.json'
    ],
    coverageDirectory: 'coverage',
    verbose: true,
    testTimeout: 30000
};
