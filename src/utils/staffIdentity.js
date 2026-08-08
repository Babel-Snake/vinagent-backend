function normalizeStaffUsername(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
}

function buildManagedStaffEmail(username, wineryId) {
    return `${normalizeStaffUsername(username)}.w${Number(wineryId)}@vinagent.internal`;
}

module.exports = {
    normalizeStaffUsername,
    buildManagedStaffEmail
};
