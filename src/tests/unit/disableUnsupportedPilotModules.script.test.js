const { main } = require('../../scripts/disableUnsupportedPilotModules');

describe('disable unsupported pilot modules script', () => {
  it('prints capability names without winery data or secrets', async () => {
    const output = [];
    const settings = {
      enableBookingModule: true,
      enableWineClubModule: false,
      enableOrdersModule: true,
      update: jest.fn().mockResolvedValue(undefined)
    };
    const db = {
      sequelize: {
        transaction: jest.fn(callback => callback({ LOCK: { UPDATE: 'UPDATE' } })),
        close: jest.fn().mockResolvedValue(undefined)
      },
      Winery: { findByPk: jest.fn().mockResolvedValue({ id: 7 }) },
      WinerySettings: { findOne: jest.fn().mockResolvedValue(settings) }
    };

    const exitCode = await main({
      env: { DEPLOYMENT_WINERY_ID: '7', DB_PASSWORD: 'must-not-appear' },
      loadDb: () => db,
      stdout: { write: value => output.push(value) }
    });

    const text = output.join('');
    expect(exitCode).toBe(0);
    expect(JSON.parse(text)).toEqual({
      status: 'configured',
      action: 'disable_unsupported_pilot_modules',
      changed: true,
      beforeCapabilities: ['booking_execution', 'crm_execution'],
      afterCapabilities: []
    });
    expect(text).not.toContain('must-not-appear');
    expect(text).not.toContain('7');
    expect(db.sequelize.close).toHaveBeenCalled();
  });

  it('fails before loading models when the deployment winery id is invalid', async () => {
    const output = [];
    const loadDb = jest.fn();

    const exitCode = await main({
      env: {},
      loadDb,
      stdout: { write: value => output.push(value) }
    });

    expect(exitCode).toBe(1);
    expect(loadDb).not.toHaveBeenCalled();
    expect(JSON.parse(output.join(''))).toMatchObject({
      status: 'failed',
      code: 'DEPLOYMENT_WINERY_ID_INVALID'
    });
  });
});
