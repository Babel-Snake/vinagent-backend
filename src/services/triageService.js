// src/services/triageService.js
// Classifies inbound messages and returns task type + payload + suggested reply.
// See TEST_PLAN.md for expected behaviours.

async function triageMessage({ body, member, winery }) {
  // TODO: Implement real triage rules.
  // For now, return a stub ADDRESS_CHANGE if "moved" appears.
  const lower = body.toLowerCase();

  if (lower.includes('moved') && lower.includes('address')) {
    return {
      type: 'ADDRESS_CHANGE',
      payload: {
        newAddress: {
          // Real implementation will parse the text into components
        }
      },
      suggestedChannel: 'sms',
      suggestedReplyBody:
        "Hi, thanks for your message. We'll send you a secure link to confirm your new address."
    };
  }

  return {
    type: 'GENERAL_QUERY',
    payload: {},
    suggestedChannel: 'sms',
    suggestedReplyBody:
      'Hi, thanks for your message. A team member will get back to you soon.'
  };
}

module.exports = {
  triageMessage
};
