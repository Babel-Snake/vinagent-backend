const {
  STATES,
  applyActionTiming,
  evaluateCondition,
  resolveTemplate
} = require('../../services/automationRuleEvaluator.service');
const { normalizeDefinition } = require('../../services/automationRuleDefinition.service');

describe('automation rule definition and evaluator', () => {
  const root = {
    event: {
      provider: 'sevenrooms',
      normalizedPayload: {
        experienceCode: 'TRUFFLE_PAIRING',
        guests: 8,
        startAt: '2026-08-24T04:00:00.000Z'
      }
    },
    context: {
      stock: { available: 5 }
    },
    rule: { id: 12, version: 3 }
  };

  test('evaluates nested deterministic conditions with explicit unknown state', () => {
    const matched = evaluateCondition({
      all: [
        { path: 'event.normalizedPayload.experienceCode', operator: 'EQ', value: 'TRUFFLE_PAIRING' },
        { path: 'event.normalizedPayload.guests', operator: 'GTE', value: 6 },
        { path: 'context.stock.available', operator: 'LT', value: 8 }
      ]
    }, root);
    expect(matched.state).toBe(STATES.MATCHED);

    const unknown = evaluateCondition({
      path: 'context.shipment.eta',
      operator: 'BEFORE',
      value: '2026-08-24T04:00:00.000Z'
    }, root);
    expect(unknown.state).toBe(STATES.UNKNOWN);

    const missing = evaluateCondition({
      path: 'context.shipment.eta',
      operator: 'NOT_EXISTS'
    }, root);
    expect(missing.state).toBe(STATES.MATCHED);
  });

  test('resolves typed and interpolated templates and relative action timing', () => {
    const resolved = resolveTemplate({
      pax: '{{event.normalizedPayload.guests}}',
      title: 'Prepare {{event.normalizedPayload.experienceCode}} for {{event.normalizedPayload.guests}} guests'
    }, root);
    expect(resolved.pax).toBe(8);
    expect(resolved.title).toBe('Prepare TRUFFLE_PAIRING for 8 guests');

    const timed = applyActionTiming(resolved, {
      dueAt: { path: 'event.normalizedPayload.startAt', offsetMinutes: -2880 }
    }, root);
    expect(timed.dueAt).toBe('2026-08-22T04:00:00.000Z');
  });

  test('normalizes a provider-neutral rule and rejects arbitrary paths', () => {
    const definition = normalizeDefinition({
      trigger: { eventType: 'Booking.Confirmed', providers: ['SevenRooms'] },
      conditions: { all: [] },
      action: {
        type: 'task',
        data: { category: 'OPERATIONS', subType: 'AUTOMATED_STOCK_CHECK' }
      }
    });
    expect(definition.trigger).toEqual({ eventType: 'booking.confirmed', providers: ['sevenrooms'] });
    expect(definition.action.type).toBe('TASK');

    expect(() => normalizeDefinition({
      trigger: { eventType: 'booking.confirmed' },
      conditions: { path: '__proto__.polluted', operator: 'EXISTS' },
      action: { type: 'TASK', data: {} }
    })).toThrow('must start with event, context, or rule');
  });
});
