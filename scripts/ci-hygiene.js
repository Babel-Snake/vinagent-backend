/**
 * CI Hygiene Check Script
 * Verifies that the repository contains no forbidden artifacts.
 * 
 * Checks:
 * 1. node_modules is NOT tracked in git.
 * 2. .env files are NOT tracked in git.
 * 3. debug_*.txt files are NOT present.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function runCommand(cmd) {
    try {
        return execSync(cmd, { encoding: 'utf8' }).trim();
    } catch (err) {
        return '';
    }
}

function checkGitTracked(pattern) {
    // git ls-files returns filenames if they are tracked.
    const output = runCommand(`git ls-files ${pattern}`);
    if (output) {
        console.error(`[FAIL] Forbidden files are tracked by git: \n${output}`);
        return false;
    }
    return true;
}

function checkFilesExist(pattern) {
    // For debug files, we just check filesystem presence in root
    // This is a simple glob check or fs check
    // If we want to check for 'debug_*.txt', we can iterate dir.
    const root = path.join(__dirname, '..');
    const files = fs.readdirSync(root);
    const debugFiles = files.filter(f => /^debug_.*\.txt$/.test(f));

    if (debugFiles.length > 0) {
        console.error(`[FAIL] Debug artifacts present: ${debugFiles.join(', ')}`);
        return false;
    }
    return true;
}

function main() {
    console.log('Running CI Hygiene Checks...');
    let passed = true;

    // 1. Check node_modules in git
    if (!checkGitTracked('node_modules/')) {
        passed = false;
    } else {
        console.log('[PASS] node_modules is not tracked.');
    }

    // 2. Check .env in git
    if (!checkGitTracked('.env')) {
        passed = false;
    } else {
        console.log('[PASS] .env is not tracked.');
    }

    // 3. Check for local debug artifacts
    if (!checkFilesExist()) {
        passed = false;
    } else {
        console.log('[PASS] No debug artifacts found.');
    }

    if (!passed) {
        console.error('CI Hygiene Check FAILED.');
        process.exit(1);
    } else {
        console.log('CI Hygiene Check PASSED.');
    }
}

main();
