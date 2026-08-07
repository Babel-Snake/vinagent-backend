'use strict';

const assert = require('node:assert/strict');
const db = require('../models');
const recordVisibility = require('../services/recordVisibility.service');
const integrationConnectionService = require('../services/integrationConnection.service');

async function requiredRecord(model, where, label) {
  const record = await model.findOne({ where });
  assert(record, `${label} was not found`);
  return record;
}

function contextFor(user, wineryId) {
  return {
    wineryId,
    userId: user.id,
    userRole: user.role
  };
}

async function verifySidewoodProductionReadiness() {
  const winery = await requiredRecord(db.Winery, { name: 'Sidewood Estate' }, 'Sidewood Estate winery');
  const users = {};
  for (const name of ['Owen', 'Serena', 'Jacob', 'Joanna']) {
    users[name.toLowerCase()] = await requiredRecord(
      db.User,
      { wineryId: winery.id, displayName: name, isActive: true },
      `${name} active user`
    );
  }

  assert.equal(users.owen.role, 'manager', 'Owen must be a winery manager');
  assert.equal(users.serena.role, 'staff', 'Serena must use area-scoped staff permissions');
  const placeholderUsers = [];
  for (const user of Object.values(users)) {
    assert(user.firebaseUid, `${user.displayName} must have an authentication identity`);
    if (String(user.firebaseUid).startsWith('seed:')) placeholderUsers.push(user.displayName);
  }

  const cellarDoor = await requiredRecord(
    db.OperationalArea,
    { wineryId: winery.id, name: 'Cellar Door', isActive: true },
    'Cellar Door area'
  );
  const restaurant = await requiredRecord(
    db.OperationalArea,
    { wineryId: winery.id, name: 'Restaurant', isActive: true },
    'Restaurant area'
  );

  const serenaMembership = await requiredRecord(
    db.UserAreaMembership,
    { wineryId: winery.id, userId: users.serena.id, areaId: cellarDoor.id },
    'Serena Cellar Door membership'
  );
  assert.equal(serenaMembership.membershipRole, 'MANAGER');
  assert.equal(Boolean(serenaMembership.isPrimary), true);

  const cellarTask = await requiredRecord(
    db.Task,
    { wineryId: winery.id, subType: 'SIDEWOOD_AREA_CELLAR_ROSTER' },
    'Cellar Door demo task'
  );
  const restaurantTask = await requiredRecord(
    db.Task,
    { wineryId: winery.id, subType: 'SIDEWOOD_AREA_RESTAURANT_FLOOR_PLAN' },
    'Restaurant demo task'
  );

  assert.equal(await recordVisibility.canViewTask(cellarTask, contextFor(users.owen, winery.id)), true);
  assert.equal(await recordVisibility.canManageTask(restaurantTask, contextFor(users.owen, winery.id)), true);
  assert.equal(await recordVisibility.canViewTask(cellarTask, contextFor(users.serena, winery.id)), true);
  assert.equal(await recordVisibility.canManageTask(cellarTask, contextFor(users.serena, winery.id)), true);
  assert.equal(
    await recordVisibility.canViewTask(restaurantTask, contextFor(users.serena, winery.id)),
    true,
    'Serena must retain visibility of cross-area work she created'
  );
  assert.equal(
    await recordVisibility.canManageTask(restaurantTask, contextFor(users.serena, winery.id)),
    false,
    'Serena must not manage work outside her managed areas'
  );
  assert.equal(await recordVisibility.canViewTask(cellarTask, contextFor(users.jacob, winery.id)), true);
  assert.equal(await recordVisibility.canManageTask(cellarTask, contextFor(users.jacob, winery.id)), false);
  assert.equal(await recordVisibility.canViewTask(restaurantTask, contextFor(users.jacob, winery.id)), false);
  assert.equal(await recordVisibility.canViewTask(restaurantTask, contextFor(users.joanna, winery.id)), true);

  const restaurantConfig = await requiredRecord(
    db.OperationalAreaIntegrationConfig,
    { wineryId: winery.id, areaId: restaurant.id },
    'Restaurant integration configuration'
  );
  const serializedConfig = integrationConnectionService.serializeAreaIntegrationConfig(restaurantConfig);
  assert(!JSON.stringify(serializedConfig).includes('webhookSecretHash'), 'Webhook secret hashes must not be serialized');

  const bookingExecution = await integrationConnectionService.resolveExecutionConfig({
    wineryId: winery.id,
    areaId: restaurant.id,
    domain: 'booking'
  });
  assert.equal(bookingExecution.provider, 'mock', 'Unsupported restaurant booking execution must fall back to mock');

  let firebaseIdentities = 'not-requested';
  const shouldVerifyFirebase =
    process.env.SIDEWOOD_SMOKE_VERIFY_FIREBASE === 'true' || process.argv.includes('--verify-firebase');
  if (shouldVerifyFirebase && placeholderUsers.length === 0) {
    const admin = require('../config/firebase');
    assert(admin.apps.length > 0, 'Firebase Admin must be initialized for identity verification');
    const identityRecords = await Promise.all(
      Object.values(users).map(user => admin.auth().getUser(user.firebaseUid))
    );
    for (const [index, identity] of identityRecords.entries()) {
      const user = Object.values(users)[index];
      assert.equal(identity.email, user.email, `${user.displayName} Firebase email must match the database`);
      assert.equal(identity.disabled, false, `${user.displayName} Firebase identity must be enabled`);
    }
    firebaseIdentities = 'passed';
  }

  const results = {
    wineryId: winery.id,
    usersChecked: Object.keys(users),
    areasChecked: [cellarDoor.name, restaurant.name],
    permissions: 'passed',
    integrationFallback: bookingExecution.provider,
    secretSerialization: 'passed',
    authenticationIdentities: placeholderUsers.length === 0 ? 'passed' : 'database-only',
    firebaseIdentities,
    placeholderUsers
  };
  process.stdout.write(`${JSON.stringify(results)}\n`);

  const allowDatabaseOnlyIdentities =
    process.env.NODE_ENV !== 'production' && process.env.SIDEWOOD_SMOKE_ALLOW_DB_ONLY_IDENTITIES === 'true';
  assert(
    placeholderUsers.length === 0 || allowDatabaseOnlyIdentities,
    `Database-only seed identities remain for: ${placeholderUsers.join(', ')}`
  );
  return results;
}

if (require.main === module) {
  verifySidewoodProductionReadiness()
    .catch(error => {
      process.stderr.write(`Sidewood production-readiness smoke failed: ${error.stack || error.message}\n`);
      process.exitCode = 1;
    })
    .finally(() => db.sequelize.close());
}

module.exports = { verifySidewoodProductionReadiness };
