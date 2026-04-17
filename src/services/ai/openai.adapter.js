const AIAdapter = require('./ai.adapter');
const OpenAI = require('openai');
const logger = require('../../config/logger');

class OpenAIAdapter extends AIAdapter {
    constructor(apiKey, model = 'gpt-4o-mini') {
        super();
        this.client = new OpenAI({ apiKey });
        this.model = model;
    }

    async classify(text, context = {}) {
        let wineryData = null;
        let wineryContextString = '';
        let memberContextString = '';

        // Fetch rich winery context if ID is available
        if (context.wineryId) {
            try {
                const { getAiContext } = require('../winery.service');
                wineryData = await getAiContext(context.wineryId);

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

        // ==========================================
        // PHASE 1: STRATEGIST (Logic & Routing)
        // ==========================================
        const strategistPrompt = `
You are the Strategist AI for ${context.wineryId ? 'a specific winery' : 'a winery'} cellar door.
Your job is to read the incoming message, analyze the winery's policies, make routing decisions, and issue exact output instructions to a downstream Copywriter AI.

**Winery Context (Source of Truth):**
${wineryContextString || 'No specific winery context available.'}

**Member Context (Who you are talking to):**
${memberContextString || 'Unknown Visitor'}

**CRITICAL DIRECTIVE ON POLICIES & FAQS:**
You MUST meticulously read the provided 'policies' and 'faqs' in the Winery Context.
If an FAQ or Policy explicitly covers the customer's request (e.g. "We do not allow the public to visit our vineyards"), you MUST adhere to it.
DO NOT offer to "check options", "verify schedules", or pass it to a staff member to decide. You must explicitly instruct the copywriter to politely reject the request.

**Classification Rules:**
Return a JSON object with the following fields:

- reasoning: A JSON object outlining your step-by-step logic BEFORE taking action. You MUST provide this:
    - 1_categorisation: Why does this request fit the selected category and subType?
    - 2_customer_detail: Summarize what you know about the customer based on the member context.
    - 3_internal_vs_external: Does this require an external handoff or can a staff member handle it?
    - 4_target_assignee: Who specifically in the organisation or staff list should handle this?
    - 5_policy_and_product_validation: Quote any FAQ that relates to the customer's intent. If it rejects the request, state that you will rigidly enforce it.
    - 6_instruction_strategy: What exact instructions will you give the copywriter? If the policy answers the question (even if it's a "no"), you must instruct the copywriter to state the policy.

- category: MUST be one of the following exact strings:
    - BOOKING, ORDER, ACCOUNT, OPERATIONS, INTERNAL, SYSTEM, GENERAL. (Do NOT use GENERAL if the user mentions orders, shipping, addresses, or bookings).

- subType: A specific intent string (e.g. BOOKING_INQUIRY, ORDER_SHIPPING_DELAY, ACCOUNT_PAYMENT_ISSUE, GENERAL_ENQUIRY).
- sentiment: One of [POSITIVE, NEUTRAL, NEGATIVE]
- priority: [low, normal, high]
- summary: A brief 1-sentence summary of the request.
- suggestedTitle: A short title for the task.
- suggestedAssigneeId: An integer matching the 'id' from the 'staff' array above. Pick the system user whose 'responsibilities' best match this task. If no staff member matches, set to null.

- suggestedAction: An INTERNAL note advising the winery team on the best next step.
    - **CRITICAL**: If the customer's contact email is missing from the context, explicitly add to this note: "Contact details missing. Please locate the customer's email before sending the drafted reply."

- suggestedRecipientEmail: The email address the reply should be sent TO.
    - **DECISION A (Staff User Match):** Draft directly to the CUSTOMER. Use the member's 'email'. **CRITICAL**: If the member's email is unknown/missing, you MUST set this to \`null\`. DO NOT hallucinate or guess a customer's email, and DO NOT use a staff member's email here.
    - **DECISION B (External Org Match):** Draft an INTERNAL ESCALATION to the STAFF CONTACT. Use the organisation contact's 'email'.

- suggestedCc: A comma-separated string of email addresses that should be CC'd on the reply. If none, set to null.

- copywriterDirectives: Extremely clear, explicit instructions to the downstream AI model detailing exactly what the email should say. Give it the sender's name to sign off with (e.g., Emily Chen, Manager), the recipient, the tone, and definitively state the answer based on your policy check in step 5. If contact details are missing, instruct the copywriter to draft the email anyway so the staff can send it once they find the address.

- suggestedSteps: An array of 1 to 5 workflow step objects that describe how the winery team should progress this task.
    - title: Short imperative title for the step.
    - description: What needs to happen in this step.
    - stepType: One of [INTERNAL, CUSTOMER_MESSAGE, CUSTOMER_WAIT, APPROVAL, EXTERNAL, EXECUTION, FOLLOW_UP, OTHER]
    - waitingOn: One of [NONE, STAFF, CUSTOMER, MANAGER, EXTERNAL]
    - ownerUserId: Integer from the staff array if a clear owner exists, otherwise null.
    - dueInHours: Integer number of hours from now when this step should ideally be completed, otherwise null.

**Input Text:**
"${text}"
`;

        try {
            // Phase 1 API Call (Strategist - gpt-4o)
            logger.info('Running AI strategist phase', { model: 'gpt-4o' });
            const strategistCompletion = await this.client.chat.completions.create({
                model: 'gpt-4o', // HARDCODED 4o for superior reasoning
                messages: [
                    { role: 'system', content: strategistPrompt },
                    { role: 'user', content: text }
                ],
                response_format: { type: 'json_object' }
            });

            const strategistResult = JSON.parse(strategistCompletion.choices[0].message.content);

            // ==========================================
            // PHASE 2: COPYWRITER (Drafting)
            // ==========================================
            
            const brandContextString = wineryData && wineryData.brand ? JSON.stringify(wineryData.brand, null, 2) : 'No brand guidelines available.';

            const copywriterPrompt = `
You are the Copywriter AI for ${context.wineryId ? 'a specific winery' : 'a winery'}.
You write emails based STRICTLY on the directives provided by the Cellar Door Manager (the Strategist AI).
Do NOT invent policies, do NOT offer to check schedules if the directive says to reject it, and do NOT change the decision.

**Brand Voice Guidelines:**
${brandContextString}

**Directives from the Strategist AI:**
- Target Recipient: ${strategistResult.suggestedRecipientEmail || 'Unknown'}
- Assigned Sender Name (to sign off as): ${wineryData?.staff?.find(s => s.id === strategistResult.suggestedAssigneeId)?.name || 'Winery Team'}
- Exact Instructions for Body text: "${strategistResult.copywriterDirectives}"

**Output Constraint:**
Return a JSON object with EXACTLY ONE field:
- suggestedReply: The FULL, READY-TO-SEND email or message. Observe channel limits (Max ${maxChars} chars for ${channel}). Use the Brand Voice Guidelines to stylize the text, but adhere strictly to the Strategist's content instructions.
`;

            // Phase 2 API Call (Copywriter - gpt-4o-mini)
            logger.info('Running AI copywriter phase', { model: this.model });
            const copywriterCompletion = await this.client.chat.completions.create({
                model: this.model, // Defaults to mini
                messages: [
                    { role: 'system', content: copywriterPrompt },
                    { role: 'user', content: text } // Provide the original text for reference
                ],
                response_format: { type: 'json_object' }
            });

            const copywriterResult = JSON.parse(copywriterCompletion.choices[0].message.content);

            // Merge output
            return {
                ...strategistResult,
                suggestedReply: copywriterResult.suggestedReply
            };

        } catch (error) {
            logger.error('OpenAI Two-Tier Classification Error', { error: error.message });
            throw error;
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
