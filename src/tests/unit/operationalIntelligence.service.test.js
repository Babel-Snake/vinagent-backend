const {
  significantTerms,
  detectRecurrenceClusters,
  requestAging,
  classificationMetrics,
  buildTrendComparison,
  buildSuggestedSignalInputs
} = require('../../services/operationalIntelligence.service');

describe('operationalIntelligence.service', () => {
  it('normalizes significant terms and removes common operational filler', () => {
    expect(significantTerms('The POS froze again during tastings')).toEqual(expect.arrayContaining(['pos', 'froze', 'again', 'dur', 'tasting']));
    expect(significantTerms('The POS froze again during tastings')).not.toContain('the');
  });

  it('detects recurrence from explainable term overlap and returns source evidence', () => {
    const clusters = detectRecurrenceClusters([
      { key: 'NOTE:1', type: 'NOTE', id: 1, title: 'POS froze at lunch', text: 'Cellar door POS froze during lunch service', eventAt: '2026-07-01T01:00:00Z', areaIds: [1], href: '/notes?recordId=1' },
      { key: 'REQUEST:2', type: 'REQUEST', id: 2, title: 'POS froze again', text: 'Please investigate why the cellar door POS froze', eventAt: '2026-07-02T01:00:00Z', areaIds: [1], href: '/requests?requestId=2' },
      { key: 'NOTICE:3', type: 'NOTICE', id: 3, title: 'New uniform policy', text: 'Staff should wear black shirts', eventAt: '2026-07-03T01:00:00Z', areaIds: [2], href: '/noticeboard?noticeId=3' }
    ]);

    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toMatchObject({ count: 2, types: ['NOTE', 'REQUEST'], areaIds: [1] });
    expect(clusters[0].keywords).toEqual(expect.arrayContaining(['pos', 'froze']));
    expect(clusters[0].examples.map(item => item.key)).toEqual(expect.arrayContaining(['NOTE:1', 'REQUEST:2']));
  });

  it('calculates pending request age buckets and overdue counts', () => {
    const now = new Date('2026-07-10T00:00:00Z');
    const result = requestAging([
      { id: 1, title: 'Recent', priority: 'normal', createdAt: '2026-07-09T12:00:00Z', dueAt: null },
      { id: 2, title: 'Old', priority: 'high', createdAt: '2026-07-01T00:00:00Z', dueAt: '2026-07-05T00:00:00Z' }
    ], now);
    expect(result).toMatchObject({ pending: 2, overdue: 1, buckets: { under24Hours: 1, overSevenDays: 1 } });
    expect(result.oldest[0].id).toBe(2);
  });

  it('reports human corrections separately from accepted classifications', () => {
    const result = classificationMetrics([
      { aiSuggestedType: 'NOTE', humanConfirmedType: 'NOTE' },
      { aiSuggestedType: 'REQUEST', humanConfirmedType: 'NOTE' },
      { aiSuggestedType: null, humanConfirmedType: 'NOTE' }
    ]);
    expect(result).toMatchObject({ evaluated: 2, accepted: 1, corrected: 1, correctionRate: 50 });
    expect(result.byTransition).toContainEqual({ suggestedType: 'REQUEST', confirmedType: 'NOTE', count: 1 });
  });

  it('compares current and previous operational volume by type and area', () => {
    const cellarArea = { id: 3, name: 'Cellar Door' };
    const result = buildTrendComparison({
      start: new Date('2026-07-01T00:00:00Z'),
      end: new Date('2026-08-01T00:00:00Z'),
      previousStart: new Date('2026-06-01T00:00:00Z'),
      previousEnd: new Date('2026-07-01T00:00:00Z'),
      current: {
        TASK: [{ OperationalAreas: [cellarArea] }, { OperationalAreas: [] }],
        NOTICE: [],
        REQUEST: [{ OperationalAreas: [cellarArea] }],
        NOTE: []
      },
      previous: {
        TASK: [{ OperationalAreas: [] }],
        NOTICE: [{ OperationalAreas: [cellarArea] }],
        REQUEST: [],
        NOTE: []
      }
    });

    expect(result.byType).toContainEqual(expect.objectContaining({ type: 'TASK', current: 2, previous: 1, delta: 1, changePercent: 100 }));
    expect(result.byType).toContainEqual(expect.objectContaining({ type: 'REQUEST', current: 1, previous: 0, delta: 1, changePercent: 100 }));
    expect(result.byArea).toContainEqual(expect.objectContaining({ areaId: 3, areaName: 'Cellar Door', current: 2, previous: 1, delta: 1 }));
    expect(result.byArea).toContainEqual(expect.objectContaining({ areaId: null, areaName: 'Organisation', current: 1, previous: 1, delta: 0 }));
  });

  it('builds thresholded suggested signal inputs without mutating records', () => {
    const start = new Date('2026-07-01T00:00:00Z');
    const end = new Date('2026-08-01T00:00:00Z');
    const signals = buildSuggestedSignalInputs({
      start,
      end,
      acknowledgements: { outstandingAcknowledgements: 2, overdueNotices: 1 },
      intelligence: {
        requestAging: { pending: 3, overdue: 1, averageAgeHours: 96, buckets: { overSevenDays: 1 }, oldest: [] },
        classification: { evaluated: 4, corrected: 2, correctionRate: 50, byTransition: [] },
        conversions: { total: 3, rejected: 1, completionRate: 33 },
        trends: {
          byType: [{ type: 'REQUEST', current: 7, previous: 2, delta: 5, changePercent: 250 }],
          byArea: [{ areaId: 9, areaName: 'Cellar Door', current: 8, previous: 3, delta: 5, changePercent: 167 }]
        }
      }
    });

    expect(signals.map(signal => signal.signalType)).toEqual(expect.arrayContaining([
      'REQUEST_AGING',
      'CLASSIFICATION_CORRECTION',
      'CONVERSION_OUTCOME',
      'TREND',
      'NOTICE_ACKNOWLEDGEMENT'
    ]));
    expect(signals.every(signal => signal.periodStart === start.toISOString())).toBe(true);
    expect(signals.every(signal => signal.fingerprint)).toBe(true);
    expect(signals.find(signal => signal.title.includes('Cellar Door')).areaId).toBe(9);
  });

  it('uses winery operational intelligence thresholds when building suggested signals', () => {
    const signals = buildSuggestedSignalInputs({
      start: new Date('2026-07-01T00:00:00Z'),
      end: new Date('2026-08-01T00:00:00Z'),
      acknowledgements: { outstandingAcknowledgements: 2, overdueNotices: 1 },
      config: {
        thresholds: {
          requestAgingOverdueCount: 5,
          requestAgingOverSevenDaysCount: 5,
          requestAgingAverageAgeHours: 240,
          classificationMinimumEvaluated: 10,
          classificationMinimumCorrected: 5,
          classificationCorrectionRate: 90,
          conversionMinimumTotal: 10,
          trendMinimumDelta: 10,
          trendMinimumChangePercent: 300,
          noticeOutstandingCount: 5
        }
      },
      intelligence: {
        requestAging: { pending: 3, overdue: 1, averageAgeHours: 96, buckets: { overSevenDays: 1 }, oldest: [] },
        classification: { evaluated: 4, corrected: 2, correctionRate: 50, byTransition: [] },
        conversions: { total: 3, rejected: 1, completionRate: 33 },
        trends: {
          byType: [{ type: 'REQUEST', current: 7, previous: 2, delta: 5, changePercent: 250 }],
          byArea: [{ areaId: 9, areaName: 'Cellar Door', current: 8, previous: 3, delta: 5, changePercent: 167 }]
        }
      }
    });

    expect(signals).toHaveLength(0);
  });
});
