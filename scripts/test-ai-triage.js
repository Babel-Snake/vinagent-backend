require('dotenv').config();
const { classifyStaffNote } = require('../src/services/triage.service');

async function testTriageService() {
    const textToTest = "Gina wants to change her next upcoming order to all pinot noir";
    console.log(`Testing text: "${textToTest}"`);

    // Simulate what the controller passes in
    try {
        const result = await classifyStaffNote({
            text: textToTest,
            memberId: null,
            wineryId: 1,
            userId: 8 // Manager
        });

        console.log('\n--- Result from classifyStaffNote ---');
        console.log(`Category: ${result.category}`);
        console.log(`SubType: ${result.subType}`);
        console.log(`Summary: ${result.suggestedTitle}`);

        if (result.category === 'ORDER') {
            console.log('\n✅ PASS: Successfully categorized as ORDER.');
        } else {
            console.error(`\n❌ FAIL: Expected category ORDER, got ${result.category}`);
        }
    } catch (e) {
        console.error('Error testing classifyStaffNote:', e);
    }
}

testTriageService();
