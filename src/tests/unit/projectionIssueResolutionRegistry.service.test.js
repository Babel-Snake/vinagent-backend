const {
  ProjectionIssueResolutionUnavailableError,
  createProjectionIssueResolutionRegistry
} = require('../../services/projectionIssueResolutionRegistry.service');
const {
  createConfiguredProjectionIssueResolutionRegistry
} = require('../../services/projectionIssueResolutions.service');

describe('projection issue resolution registry', () => {
  test('registers and dispatches typed handlers deterministically', async () => {
    const registry = createProjectionIssueResolutionRegistry();
    const handler = jest.fn(async (_issue, data) => ({ resolutionData: data }));
    expect(registry.register('LOCATION_UNMAPPED', handler)).toBe('LOCATION_UNMAPPED');
    expect(registry.has('location_unmapped')).toBe(true);
    expect(registry.list()).toEqual(['LOCATION_UNMAPPED']);
    await expect(registry.resolve(
      { issueType: 'LOCATION_UNMAPPED' },
      { decision: 'TEST' }
    )).resolves.toEqual({ resolutionData: { decision: 'TEST' } });
    expect(() => registry.register('LOCATION_UNMAPPED', handler)).toThrow('already registered');
  });

  test('fails unregistered types and configures only safe legacy decisions', async () => {
    const registry = createProjectionIssueResolutionRegistry();
    await expect(registry.resolve({ issueType: 'LOCATION_UNMAPPED' }, {}))
      .rejects.toBeInstanceOf(ProjectionIssueResolutionUnavailableError);
    expect(createConfiguredProjectionIssueResolutionRegistry().list()).toEqual([
      'CONNECTION_MAPPING_AMBIGUOUS',
      'CONNECTION_MAPPING_STALE',
      'SOURCE_CONFLICT'
    ]);
  });
});
