const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
    {
        ignores: ['coverage/**', 'dist/**', 'build/**', 'node_modules/**']
    },
    {
        files: ['src/**/*.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'commonjs',
            globals: {
                ...globals.node,
                ...globals.jest
            }
        },
        rules: {
            ...js.configs.recommended.rules,
            'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
            'no-console': ['warn', { allow: ['warn', 'error'] }],
            'prefer-const': 'error',
            'no-var': 'error'
        }
    },
    {
        files: ['src/db/migrations/**/*.js'],
        rules: {
            'no-unused-vars': ['error', { argsIgnorePattern: '^_|^Sequelize$', caughtErrors: 'none' }]
        }
    },
    {
        files: [
            'src/scripts/**/*.js',
            'src/tests/**/*.js',
            'src/services/integrations/**/providers/mock.js'
        ],
        rules: {
            'no-console': 'off'
        }
    }
];
