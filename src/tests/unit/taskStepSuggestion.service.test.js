const {
  buildFallbackStepSuggestionBody,
  buildStepSuggestedAction,
  buildStepSuggestionPrompt,
  getStepSuggestionChannel,
  resolveStepSuggestionTarget
} = require('../../services/taskStepSuggestion.service');

describe('taskStepSuggestion service', () => {
  it('selects an explicit valid channel before task and step-type fallbacks', () => {
    expect(getStepSuggestionChannel(
      { stepType: 'CUSTOMER_MESSAGE', suggestedChannel: 'sms' },
      { suggestedChannel: 'email' }
    )).toBe('sms');
    expect(getStepSuggestionChannel(
      { stepType: 'CUSTOMER_MESSAGE' },
      { suggestedChannel: 'email' }
    )).toBe('email');
    expect(getStepSuggestionChannel({ stepType: 'APPROVAL' }, {})).toBe('email');
    expect(getStepSuggestionChannel({ stepType: 'INTERNAL' }, {})).toBe('none');
  });

  it('resolves email targets in override, step, task, member, and intake order', () => {
    const task = {
      suggestedRecipientEmail: 'task@example.com',
      suggestedReplySubject: 'Task subject',
      Member: { email: 'member@example.com' },
      payload: { manualIntake: { requesterEmail: 'intake@example.com' } }
    };
    const step = {
      title: 'Confirm booking',
      suggestedRecipientEmail: 'step@example.com',
      suggestedReplySubject: 'Step subject',
      suggestedCc: 'manager@example.com'
    };

    expect(resolveStepSuggestionTarget({
      step,
      task,
      channel: 'email',
      overrides: {
        suggestedRecipientEmail: 'override@example.com',
        suggestedReplySubject: 'Override subject'
      }
    })).toEqual({
      to: 'override@example.com',
      subject: 'Override subject',
      cc: 'manager@example.com'
    });
  });

  it('builds a prompt containing request, timeline, and target-step context', () => {
    const targetStep = {
      id: 2,
      title: 'Reply to guest',
      description: 'Confirm their booking request.',
      stepType: 'CUSTOMER_MESSAGE',
      status: 'PENDING',
      waitingOn: 'STAFF',
      sortOrder: 1
    };
    const prompt = buildStepSuggestionPrompt({
      task: {
        category: 'BOOKING',
        subType: 'BOOKING_NEW',
        status: 'PENDING',
        workflowState: 'IN_PROGRESS',
        payload: { originalText: 'Can I book a table for Saturday?' },
        Messages: [{
          direction: 'inbound',
          source: 'email',
          subject: 'Saturday booking',
          body: 'Can I book a table for Saturday?',
          receivedAt: '2026-07-10T01:00:00.000Z'
        }],
        TaskSteps: [targetStep]
      },
      step: targetStep,
      channel: 'email'
    });

    expect(prompt).toContain('Original Request: "Can I book a table for Saturday?"');
    expect(prompt).toContain('Task Communication Timeline:');
    expect(prompt).toContain('TARGET STEP: [PENDING] Reply to guest');
    expect(prompt).toContain('Generate only the ready-to-send email message');
  });

  it('builds channel-appropriate fallback copy and actions', () => {
    const task = { Member: { firstName: 'Serena' } };
    const step = { title: 'Confirm completion', description: 'Check the final record.' };

    expect(buildFallbackStepSuggestionBody({ task, step, channel: 'email' })).toContain('Hi Serena,');
    expect(buildFallbackStepSuggestionBody({ task, step, channel: 'none' })).toContain('Confirm completion');
    expect(buildStepSuggestedAction(step, 'none')).toContain('Complete the internal workflow step');
  });
});
