const { classifyOperationalType } = require('../../services/operationalClassification.service');

describe('operationalClassification.service', () => {
  test.each([
    ['We need more takeaway bags.', 'REQUEST'],
    ['Order more takeaway bags before Friday.', 'TASK'],
    ['Takeaway bags are running low.', 'NOTE'],
    ['Until new bags arrive, use plain carry bags.', 'NOTICE'],
    ['POS froze twice during lunch.', 'NOTE'],
    ['Can someone approve this refund?', 'REQUEST'],
    ['Call back the wedding enquiry tomorrow.', 'TASK'],
    ['New tasting policy starts Saturday.', 'NOTICE']
  ])('classifies %s as %s', (text, expected) => {
    const result = classifyOperationalType(text);
    expect(result.suggestedType).toBe(expected);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  test('prefers a valid explicit AI classification and bounds confidence', () => {
    expect(classifyOperationalType('Anything', { suggestedType: 'request', confidence: 1.5 })).toEqual({
      suggestedType: 'REQUEST',
      confidence: 1,
      classificationSource: 'AI'
    });
  });
});
