// jest.config.js
module.exports = {
    testEnvironment: 'node',
    // The repository-level Jest command is the backend suite. The frontend
    // uses its own Node/Next smoke commands and includes native ESM tests.
    testPathIgnorePatterns: ['/node_modules/', '/frontend/'],
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
