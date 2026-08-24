process.env.NODE_ENV = 'test';

const db = require('../../models');
const {
  prepareProviderSchedulePermit,
  finalizeProviderSchedulePermit
} = require('../../services/integrationProviderSchedule.service');

describe('provider-neutral integration schedule permits', () => {
  beforeEach(async () => db.sequelize.sync({ force: true }));
  afterAll(async () => db.sequelize.close());

  test('enforces spacing and fixed windows independently for each domain/provider pair', async () => {
    const now = new Date('2026-08-20T00:00:00.000Z');
    const policy = {
      policyVersion: '1',
      minimumSpacingSeconds: 5,
      rateWindowSeconds: 60,
      maxJobsPerRateWindow: 2
    };
    await db.sequelize.transaction(async transaction => {
      const permit = await prepareProviderSchedulePermit({
        domain: 'BOOKING',
        providerKey: 'shared-provider',
        now,
        transaction,
        ...policy
      });
      expect(permit).toMatchObject({ granted: true, reason: null });
      await finalizeProviderSchedulePermit({
        permit,
        consumed: true,
        jobKind: 'BOOKING_INCREMENTAL',
        workerId: 'worker-a',
        metadata: { scheduler: 'booking' },
        transaction
      });
    });

    await db.sequelize.transaction(async transaction => {
      const permit = await prepareProviderSchedulePermit({
        domain: 'BOOKING',
        providerKey: 'shared-provider',
        now: new Date('2026-08-20T00:00:01.000Z'),
        transaction,
        ...policy
      });
      expect(permit).toMatchObject({
        granted: false,
        reason: 'PROVIDER_SPACING',
        nextAvailableAt: new Date('2026-08-20T00:00:05.000Z')
      });
    });

    await db.sequelize.transaction(async transaction => {
      const permit = await prepareProviderSchedulePermit({
        domain: 'BOOKING',
        providerKey: 'shared-provider',
        now: new Date('2026-08-20T00:00:06.000Z'),
        transaction,
        ...policy
      });
      expect(permit.granted).toBe(true);
      await finalizeProviderSchedulePermit({
        permit,
        consumed: true,
        jobKind: 'BOOKING_RECONCILE',
        workerId: 'worker-a',
        transaction
      });
    });

    await db.sequelize.transaction(async transaction => {
      const permit = await prepareProviderSchedulePermit({
        domain: 'BOOKING',
        providerKey: 'shared-provider',
        now: new Date('2026-08-20T00:00:07.000Z'),
        transaction,
        ...policy
      });
      expect(permit).toMatchObject({
        granted: false,
        reason: 'PROVIDER_RATE_WINDOW',
        nextAvailableAt: new Date('2026-08-20T00:01:00.000Z')
      });
    });

    await db.sequelize.transaction(async transaction => {
      const permit = await prepareProviderSchedulePermit({
        domain: 'CLUB',
        providerKey: 'shared-provider',
        now: new Date('2026-08-20T00:00:01.000Z'),
        transaction,
        ...policy
      });
      expect(permit.granted).toBe(true);
      await finalizeProviderSchedulePermit({
        permit,
        consumed: true,
        jobKind: 'CLUB_INCREMENTAL',
        workerId: 'worker-b',
        metadata: { scheduler: 'club' },
        transaction
      });
    });

    expect(await db.IntegrationProviderScheduleState.count()).toBe(2);
    const bookingState = await db.IntegrationProviderScheduleState.findOne({
      where: { domain: 'BOOKING', providerKey: 'shared-provider' }
    });
    expect(bookingState.toJSON()).toMatchObject({
      scheduledCount: 2,
      rateWindowScheduledCount: 2,
      lastJobKind: 'BOOKING_RECONCILE',
      metadata: expect.objectContaining({ scheduler: 'booking', schedulerWorkerId: 'worker-a' })
    });
  });

  test('rolls permit consumption back with the caller transaction', async () => {
    await expect(db.sequelize.transaction(async transaction => {
      const permit = await prepareProviderSchedulePermit({
        domain: 'FULFILMENT',
        providerKey: 'postage-provider',
        policyVersion: '1',
        minimumSpacingSeconds: 5,
        rateWindowSeconds: 60,
        maxJobsPerRateWindow: 10,
        now: new Date('2026-08-20T01:00:00.000Z'),
        transaction
      });
      await finalizeProviderSchedulePermit({
        permit,
        consumed: true,
        jobKind: 'SHIPMENT_INCREMENTAL',
        workerId: 'worker-a',
        transaction
      });
      throw new Error('force rollback');
    })).rejects.toThrow('force rollback');

    expect(await db.IntegrationProviderScheduleState.count()).toBe(0);
  });
});
