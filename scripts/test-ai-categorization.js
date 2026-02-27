require('dotenv').config();
const getAIService = require('../src/services/ai');

async function testCategorization() {
    const ai = getAIService;

    console.log(`Using Adapter: ${ai.constructor.name}\n`);

    const textToTest = "Gina wants to change her next upcoming order to all pinot noir";
    console.log(`Testing text: "${textToTest}"`);

    const result = await ai.classify(textToTest, {
        member: { firstName: 'Gina', lastName: 'Guest' },
        wineryId: 1
    });

    console.log('\n--- Result ---');
    console.log(`Category: ${result.category}`);
    console.log(`SubType: ${result.subType}`);
    console.log(`Summary: ${result.summary}`);

    if (result.category === 'ORDER') {
        console.log('\n✅ PASS: Successfully categorized as ORDER.');
    } else {
        console.error(`\n❌ FAIL: Expected category ORDER, got ${result.category}`);
    }
}

testCategorization().catch(console.error);
