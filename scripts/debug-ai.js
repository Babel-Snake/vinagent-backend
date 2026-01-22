require('dotenv').config();
const aiService = require('../src/services/ai');

const input = "I need to change my address to 123 Fake St, Springfield. My name is Homer Simpson.";

console.log("--- AI Debug Script ---");
console.log(`AI_SKIP: ${process.env.AI_SKIP}`);
console.log(`AI_PROVIDER: ${process.env.AI_PROVIDER || 'default(openai)'}`);
console.log(`OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? 'Set' : 'Missing'}`);
console.log(`Input Text: "${input}"`);

async function run() {
    try {
        console.log("\nCalling aiService.classify()...");
        const start = Date.now();

        const result = await aiService.classify(input, {
            wineryId: 1,
            member: {
                firstName: 'Homer',
                lastName: 'Simpson',
                email: 'homer@example.com',
                tier: 'Gold'
            },
            suggestedChannel: 'sms'
        });

        const duration = Date.now() - start;
        console.log(`\nSuccess! Took ${duration}ms`);
        console.log("\n--- AI Result ---");
        console.log(JSON.stringify(result, null, 2));

        if (result.suggestedTitle) {
            console.log("\n[PASS] 'suggestedTitle' is present.");
        } else {
            console.log("\n[FAIL] 'suggestedTitle' is MISSING.");
        }

        if (result.suggestedReply && result.suggestedReply.includes('Homer')) {
            console.log("[PASS] 'suggestedReply' addresses member by name.");
        } else {
            console.log("[WARN] 'suggestedReply' might not be using member context.");
        }

    } catch (e) {
        console.error("\n[ERROR] AI Classification Failed:");
        console.error(e);
    }
}

run();
