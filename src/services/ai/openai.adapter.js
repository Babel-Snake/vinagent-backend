const AIAdapter = require('./ai.adapter');
const OpenAI = require('openai');

class OpenAIAdapter extends AIAdapter {
    constructor(apiKey, model = 'gpt-4o-mini') {
        super();
        this.client = new OpenAI({ apiKey });
        this.model = model;
    }

    async classify(text, context = {}) {
        let wineryContextString = '';

        // Fetch rich winery context if ID is available
        if (context.wineryId) {
            try {
                const { getAiContext } = require('../winery.service');
                const wineryData = await getAiContext(context.wineryId);

                if (wineryData) {
                    wineryContextString = JSON.stringify(wineryData, null, 2);
                }
            } catch (err) {
                console.warn('Failed to load winery AI context:', err.message);
            }
        }

        const systemPrompt = `
You are VinAgent, an intelligent cellar door assistant for ${context.wineryId ? 'a specific winery' : 'a winery'}.
Your job is to analyze incoming messages and classify them into a structured task format.

**Winery Context (Source of Truth):**
${wineryContextString || 'No specific winery context available.'}

**Classification Rules:**
Return a JSON object with the following fields:
- category: One of [BOOKING, ORDER, ACCOUNT, GENERAL, OPERATIONS, INTERNAL, SYSTEM]
- subType: A specific intent (e.g., ORDER_SHIPPING_DELAY, OPERATIONS_SUPPLY_REQUEST). Infer from context.
- sentiment: One of [POSITIVE, NEUTRAL, NEGATIVE]
- priority: [low, normal, high] (High if angry, urgent, or payment issue)
- summary: A brief 1-sentence summary of the request.
- suggestedTitle: A short title for the task.
- suggestedReply: A polite, professional SMS reply (max 160 chars) to the customer. 
    - ADHERE TO THE "BRAND VOICE" SETTINGS IN THE CONTEXT.
    - USE THE "POLICIES" AND "FAQS" TO ANSWER QUESTIONS ACCURATELY.
    - IF A PRODUCT IS MENTIONED, CHECK "INVENTORY" FOR PRICE/STOCK.
    - DO NOT HALLUCINATE. If info is missing, ask the customer.

**Input Text:**
"${text}"
`;

        try {
            const completion = await this.client.chat.completions.create({
                model: this.model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: text }
                ],
                response_format: { type: 'json_object' }
            });

            const content = completion.choices[0].message.content;
            return JSON.parse(content);
        } catch (error) {
            console.error('OpenAI Classification Error:', error);
            throw error; // Let caller handle fallback or logging
        }
    }

    async generate(prompt) {
        // Simple generation wrapper
        const completion = await this.client.chat.completions.create({
            model: this.model,
            messages: [{ role: 'user', content: prompt }]
        });
        return completion.choices[0].message.content;
    }
}

module.exports = OpenAIAdapter;
