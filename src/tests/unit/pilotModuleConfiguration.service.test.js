const {
  disableUnsupportedPilotModules,
  enabledUnsupportedCapabilities,
  parseDeploymentWineryId
} = require('../../services/pilotModuleConfiguration.service');

function createDb({ winery = { id: 7 }, settings = null } = {}) {
  const transaction = { LOCK: { UPDATE: 'UPDATE' } };
  return {
    transaction,
    db: {
      sequelize: {
        transaction: jest.fn(callback => callback(transaction))
      },
      Winery: {
        findByPk: jest.fn().mockResolvedValue(winery)
      },
      WinerySettings: {
        findOne: jest.fn().mockResolvedValue(settings)
      }
    }
  };
}

describe('pilot module configuration', () => {
  it('requires a positive integer deployment winery id', () => {
    expect(() => parseDeploymentWineryId('')).toThrow(expect.objectContaining({
      code: 'DEPLOYMENT_WINERY_ID_INVALID'
    }));
    expect(() => parseDeploymentWineryId('1.5')).toThrow(expect.objectContaining({
      code: 'DEPLOYMENT_WINERY_ID_INVALID'
    }));
    expect(parseDeploymentWineryId('7')).toBe(7);
  });

  it('reports only capability names', () => {
    expect(enabledUnsupportedCapabilities({
      enableBookingModule: true,
      enableWineClubModule: true,
      enableOrdersModule: true
    })).toEqual(['booking_execution', 'crm_execution']);
  });

  it('disables only unsupported pilot module flags for the deployment winery', async () => {
    const settings = {
      enableBookingModule: true,
      enableWineClubModule: true,
      enableOrdersModule: false,
      enableVoice: true,
      update: jest.fn().mockResolvedValue(undefined)
    };
    const { db, transaction } = createDb({ settings });

    await expect(disableUnsupportedPilotModules({
      db,
      deploymentWineryId: '7'
    })).resolves.toEqual({
      beforeCapabilities: ['booking_execution', 'crm_execution'],
      afterCapabilities: [],
      changedCapabilities: ['booking_execution', 'crm_execution'],
      changed: true
    });

    expect(db.Winery.findByPk).toHaveBeenCalledWith(7, {
      attributes: ['id'],
      transaction,
      lock: 'UPDATE'
    });
    expect(db.WinerySettings.findOne).toHaveBeenCalledWith({
      where: { wineryId: 7 },
      transaction,
      lock: 'UPDATE'
    });
    expect(settings.update).toHaveBeenCalledWith({
      enableBookingModule: false,
      enableWineClubModule: false
    }, { transaction });
    expect(settings.enableVoice).toBe(true);
  });

  it('is idempotent when all unsupported modules are already disabled', async () => {
    const settings = {
      enableBookingModule: false,
      enableWineClubModule: false,
      enableOrdersModule: false,
      update: jest.fn()
    };
    const { db } = createDb({ settings });

    const result = await disableUnsupportedPilotModules({ db, deploymentWineryId: 7 });

    expect(result).toMatchObject({
      beforeCapabilities: [],
      afterCapabilities: [],
      changed: false
    });
    expect(settings.update).not.toHaveBeenCalled();
  });

  it('requires an existing deployment winery and settings row', async () => {
    const missingWinery = createDb({ winery: null });
    await expect(disableUnsupportedPilotModules({
      db: missingWinery.db,
      deploymentWineryId: 7
    })).rejects.toMatchObject({ code: 'DEPLOYMENT_WINERY_NOT_FOUND' });

    const missingSettings = createDb({ settings: null });
    await expect(disableUnsupportedPilotModules({
      db: missingSettings.db,
      deploymentWineryId: 7
    })).rejects.toMatchObject({ code: 'WINERY_SETTINGS_NOT_FOUND' });
  });
});
