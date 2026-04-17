require('dotenv').config();
const aiService = require('../src/services/ai');

const input = "member Sim User is asking if we run tours of the vineyard as he is interested in doing one. His email is sim@example.com.";

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
                firstName: 'Sim',
                lastName: 'User',
                email: 'sim@example.com',
                phone: '0412345678',
                tier: 'Standard',
                notes: 'No specific notes.'
            },
            suggestedChannel: 'email'
        });

        const duration = Date.now() - start;
        console.log(`\nSuccess! Took ${duration}ms`);
        console.log("\n--- AI Result ---");
        console.log(JSON.stringify(result, null, 2));

        // Check reasoning
        if (result.reasoning) {
            console.log("\n[PASS] 'reasoning' block is present.");
            if (result.reasoning['5_policy_and_product_validation']) {
                console.log("[PASS] Policy validation step exists:", result.reasoning['5_policy_and_product_validation']);
            } else {
                console.log("[FAIL] Policy validation step is MISSING from reasoning.");
            }
        } else {
            console.log("\n[FAIL] 'reasoning' block is MISSING.");
        }

        // Check reply doesn't offer tours
        if (result.suggestedReply && result.suggestedReply.toLowerCase().includes('biosecurity')) {
            console.log("[PASS] Reply correctly mentions biosecurity policy.");
        } else {
            console.log("[WARN] Reply may not reference the biosecurity policy.");
        }

        if (result.suggestedRecipientEmail) {
            console.log(`[INFO] Recipient Email: ${result.suggestedRecipientEmail}`);
        }
        if (result.suggestedAssigneeId) {
            console.log(`[INFO] Suggested Assignee ID: ${result.suggestedAssigneeId}`);
        }

    } catch (e) {
        console.error("\n[ERROR] AI Classification Failed:");
        console.error(e);
    }
}

run();
