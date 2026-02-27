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
        let memberContextString = '';

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

        // Format Member Context if available
        if (context.member) {
            memberContextString = JSON.stringify({
                firstName: context.member.firstName,
                lastName: context.member.lastName,
                email: context.member.email,
                phone: context.member.phone,
                notes: context.member.notes || 'No specific notes.',
                tier: context.member.tier || 'Standard'
            }, null, 2);
        }

        const channel = context.suggestedChannel || 'sms'; // Default to SMS style if unknown
        const maxChars = channel === 'sms' ? 160 : 1000;

        const systemPrompt = `
You are VinAgent, an intelligent cellar door assistant for ${context.wineryId ? 'a specific winery' : 'a winery'}.
Your job is to analyze incoming messages and classify them into a structured task format.

**Winery Context (Source of Truth):**
${wineryContextString || 'No specific winery context available.'}

**Member Context (Who you are talking to):**
${memberContextString || 'Unknown Visitor'}

**Classification Rules:**
Return a JSON object with the following fields:
- category: MUST be one of the following exact strings:
    - BOOKING: Any request to make, change, cancel, or inquire about a tasting, tour, or visit.
    - ORDER: Anything related to purchasing wine, shipping updates, tracking, damaged goods, modifying an existing order, or postponing wine club orders.
    - ACCOUNT: Managing customer details, address changes, updating payment methods, or login/password issues.
    - OPERATIONS: Internal winery issues, maintenance, broken equipment, or staff supplies.
    - INTERNAL: Reminders and follow-ups between staff.
    - SYSTEM: Automated alerts from the software.
    - GENERAL: General questions that do not fit any of the above (e.g., "What time do you open?", "Are you dog friendly?"). Do NOT use GENERAL if the user mentions orders, shipping, addresses, or bookings.

- subType: A specific intent string. Preferably use one of these standards, or invent a clear one if none fit:
    - Booking: BOOKING_NEW, BOOKING_CHANGE, BOOKING_CANCELLATION, BOOKING_INQUIRY
    - Order: ORDER_NEW, ORDER_MODIFICATION, ORDER_SHIPPING_DELAY, ORDER_STATUS, ORDER_REPLACEMENT_REQUEST, ORDER_POSTPONE
    - Account: ACCOUNT_ADDRESS_CHANGE, ACCOUNT_PAYMENT_ISSUE, ACCOUNT_LOGIN_ISSUE
    - Operations: OPERATIONS_SUPPLY_REQUEST, OPERATIONS_MAINTENANCE_REQUEST, OPERATIONS_ESCALATION
    - General: GENERAL_ENQUIRY, GENERAL_FEEDBACK

- sentiment: One of [POSITIVE, NEUTRAL, NEGATIVE]
- priority: [low, normal, high] (High if angry, urgent, or payment issue)
- summary: A brief 1-sentence summary of the request.
- suggestedTitle: A short title for the task.
- suggestedReply: A FULL, READY-TO-SEND reply to the customer via ${channel.toUpperCase()}.
    - **Context Aware**: Address the member by name if known (${context.member ? context.member.firstName : 'Visitor'}).
    - **Brand Voice**: STRICTLY follow the 'tone', 'doSay', and 'dontSay' guidelines in the Winery Context.
    - **Channel Constraints**: Max ${maxChars} characters.
    - **Content**: 
        - If they ask a question -> Answer it using the FAQs/Policies.
        - If they want a booking -> Check 'experiences' and propose a next step (or confirm if simple).
        - If they have a problem -> Empathize and propose a solution (e.g. "I'll look into that immediately").
    - **Sign-off**: Use the brand sign-off if defined.

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
