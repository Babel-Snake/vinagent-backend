const AIAdapter = require('./ai.adapter');
const OpenAI = require('openai');
const logger = require('../../config/logger');
const { getOutboundHttpTimeoutMs } = require('../../utils/outboundHttpPolicy');
const { safeRecordUsageEvent } = require('../usageTracking.service');
const { METRICS } = require('../usageMetricCatalog');

async function recordCompletionUsage(completion, { wineryId, model, operation }) {
    if (!wineryId || !completion?.id) return;
    const common = {
        wineryId,
        occurredAt: completion.created ? new Date(completion.created * 1000) : new Date(),
        sourceType: 'openai_completion',
        sourceId: completion.id
    };
    const dimensions = { provider: 'openai', model, operation };
    const usage = completion.usage || {};
    const records = [
        [METRICS.AI_REQUEST, 1, { ...dimensions, result: 'success' }, 'request'],
        [METRICS.AI_INPUT_TOKENS, Number(usage.prompt_tokens || 0), dimensions, 'input'],
        [METRICS.AI_OUTPUT_TOKENS, Number(usage.completion_tokens || 0), dimensions, 'output'],
        [METRICS.AI_TOTAL_TOKENS, Number(usage.total_tokens || 0), dimensions, 'total']
    ];
    await Promise.all(records.map(([metricKey, quantity, metricDimensions, suffix]) => safeRecordUsageEvent({
        ...common,
        metricKey,
        quantity,
        idempotencyKey: `openai:${completion.id}:${suffix}`,
        dimensions: metricDimensions
    })));
}

function formatResponseChannel(channel) {
    if (channel === 'email') return 'email';
    if (channel === 'sms') return 'SMS/text';
    if (channel === 'voice') return 'phone call';
    return 'internal/no customer reply';
}

function buildResponseContactContext(context, channel) {
    const manualIntake = context.manualIntake || {};
    const email = context.contact?.email
        || context.member?.email
        || context.requesterEmail
        || manualIntake.requesterEmail
        || null;
    const phone = context.contact?.phone
        || context.member?.phone
        || context.requesterPhone
        || manualIntake.requesterPhone
        || null;
    const requiredContact = channel === 'email'
        ? 'email'
        : channel === 'sms' || channel === 'voice'
            ? 'phone'
            : 'none';
    const hasRequiredContact = requiredContact === 'email'
        ? Boolean(email)
        : requiredContact === 'phone'
            ? Boolean(phone)
            : true;

    return {
        preferredResponseChannel: channel,
        preferredResponseChannelLabel: formatResponseChannel(channel),
        requesterName: context.requesterName || manualIntake.requesterName || null,
        email,
        phone,
        requiredContact,
        hasRequiredContact
    };
}

function stripIrrelevantEmailWarning(action, channel, responseContact) {
    if (!action || !['sms', 'voice'].includes(channel) || !responseContact.phone) {
        return action;
    }

    return String(action)
        .replace(/Contact details missing\.?\s*Please locate the customer's email before sending the drafted reply\.?/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

class OpenAIAdapter extends AIAdapter {
    constructor(apiKey, model = 'gpt-4o-mini') {
        super();
        this.client = new OpenAI({
            apiKey,
            timeout: getOutboundHttpTimeoutMs(process.env.AI_HTTP_TIMEOUT_MS || 30_000),
            maxRetries: 1
        });
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
                const areaIds = [context.areaId, context.confirmedAreaId, context.suggestedAreaId]
                    .map(Number)
                    .filter(areaId => Number.isInteger(areaId) && areaId > 0);
                wineryData = await getAiContext(context.wineryId, { areaIds });

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
        const responseContact = buildResponseContactContext(context, channel);
        const responseContactString = JSON.stringify(responseContact, null, 2);
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

**Preferred Response Channel & Contact Context:**
${responseContactString}

**CRITICAL CONTACT RULES:**
- The preferred response channel is ${formatResponseChannel(channel)}.
- Only warn about missing contact details if the contact detail required for that preferred response channel is missing.
- Email replies require an email address.
- SMS/text replies and phone-call responses require a phone number.
- If the preferred response channel is SMS/text or phone call and a phone number is available, DO NOT ask staff to locate an email before responding.
- If the preferred response channel is internal/no customer reply, do not ask for customer contact details unless the task itself explicitly requires them.

**CRITICAL DIRECTIVE ON POLICIES & FAQS:**
You MUST meticulously read the provided 'policies' and 'faqs' in the Winery Context.
If an FAQ or Policy explicitly covers the customer's request (e.g. "We do not allow the public to visit our vineyards"), you MUST adhere to it.
DO NOT offer to "check options", "verify schedules", or pass it to a staff member to decide. You must explicitly instruct the copywriter to politely reject the request.

**Classification Rules:**
Return a JSON object with the following fields:

- suggestedType: One of [TASK, NOTICE, REQUEST, NOTE]. TASK means assigned action; NOTICE means broadcast information; REQUEST means approval/help/decision/information/resources are needed; NOTE means recorded context without an immediate required action.
- confidence: A number from 0 to 1 expressing confidence in suggestedType.

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
    - **CRITICAL**: Be channel-aware. If the required contact detail for the preferred response channel is missing, explicitly say which detail is missing. Do not mention missing email for SMS/text or phone-call responses when a phone number is available.

- suggestedRecipientEmail: The email address the reply should be sent TO.
    - Only populate this field for an email response or an internal email escalation. If the preferred response channel is SMS/text, phone call, or no customer reply, set this to \`null\`.
    - **DECISION A (Staff User Match):** Draft directly to the CUSTOMER. Use the member's or requester email only when the preferred response channel is email. **CRITICAL**: If the customer's email is unknown/missing, you MUST set this to \`null\`. DO NOT hallucinate or guess a customer's email, and DO NOT use a staff member's email here.
    - **DECISION B (External Org Match):** Draft an INTERNAL ESCALATION to the STAFF CONTACT. Use the organisation contact's 'email'.

- suggestedCc: A comma-separated string of email addresses that should be CC'd on the reply. If none, set to null.

- copywriterDirectives: Extremely clear, explicit instructions to the downstream AI model detailing exactly what the response should say for the preferred response channel. Give it the sender's name to sign off with (e.g., Emily Chen, Manager), the recipient, the tone, and definitively state the answer based on your policy check in step 5. If the required contact detail for the preferred response channel is missing, instruct the copywriter to draft the response anyway so staff can send it once they find that detail.

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
            await recordCompletionUsage(strategistCompletion, {
                wineryId: context.wineryId,
                model: 'gpt-4o',
                operation: 'classification_strategy'
            });

            const strategistResult = JSON.parse(strategistCompletion.choices[0].message.content);
            strategistResult.suggestedAction = stripIrrelevantEmailWarning(
                strategistResult.suggestedAction,
                channel,
                responseContact
            );
            strategistResult.copywriterDirectives = stripIrrelevantEmailWarning(
                strategistResult.copywriterDirectives,
                channel,
                responseContact
            );

            if (channel !== 'email') {
                strategistResult.suggestedRecipientEmail = null;
                strategistResult.suggestedCc = null;
            }

            // ==========================================
            // PHASE 2: COPYWRITER (Drafting)
            // ==========================================
            
            const brandContextString = wineryData && wineryData.brand ? JSON.stringify(wineryData.brand, null, 2) : 'No brand guidelines available.';
            const targetRecipient = channel === 'email'
                ? strategistResult.suggestedRecipientEmail || 'Unknown email recipient'
                : channel === 'sms' || channel === 'voice'
                    ? responseContact.phone || 'Unknown phone number'
                    : 'No outbound customer recipient';

            const copywriterPrompt = `
You are the Copywriter AI for ${context.wineryId ? 'a specific winery' : 'a winery'}.
You write customer responses based STRICTLY on the directives provided by the Cellar Door Manager (the Strategist AI).
Do NOT invent policies, do NOT offer to check schedules if the directive says to reject it, and do NOT change the decision.

**Brand Voice Guidelines:**
${brandContextString}

**Directives from the Strategist AI:**
- Preferred Response Channel: ${formatResponseChannel(channel)}
- Target Recipient: ${targetRecipient}
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
            await recordCompletionUsage(copywriterCompletion, {
                wineryId: context.wineryId,
                model: this.model,
                operation: 'classification_copywriting'
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

    async generate(prompt, context = {}) {
        // Simple generation wrapper
        const completion = await this.client.chat.completions.create({
            model: this.model,
            messages: [{ role: 'user', content: prompt }]
        });
        await recordCompletionUsage(completion, {
            wineryId: context.wineryId,
            model: this.model,
            operation: context.operation || 'generation'
        });
        return completion.choices[0].message.content;
    }
}

module.exports = OpenAIAdapter;
