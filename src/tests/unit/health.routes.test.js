const express = require('express');
const request = require('supertest');
const { createHealthRouter } = require('../../routes/health.routes');
const { createHttpsEnforcement } = require('../../middleware/httpsEnforcement');

function appWithHealth(readinessCheck) {
  const app = express();
  app.set('trust proxy', 1);
  app.use('/health', createHealthRouter({
    readinessCheck,
    readinessCacheMs: 0,
    readinessTimeoutMs: 100
  }));
  return app;
}

describe('operational health routes', () => {
  test('liveness is dependency-free and legacy /health remains available', async () => {
    const readinessCheck = jest.fn().mockRejectedValue(new Error('database secret detail'));
    const app = appWithHealth(readinessCheck);

    await request(app).get('/health').expect(200, { status: 'ok' });
    await request(app).get('/health/live').expect(200, { status: 'ok' });
    expect(readinessCheck).not.toHaveBeenCalled();
  });

  test('readiness returns 503 with bounded dependency codes and no error details', async () => {
    const app = appWithHealth(jest.fn().mockResolvedValue({
      ready: false,
      checks: {
        database: { status: 'fail', code: 'DATABASE_UNAVAILABLE', internalError: 'password=secret' }
      }
    }));

    const response = await request(app).get('/health/ready').expect(503);
    expect(response.body).toEqual({
      status: 'not_ready',
      checks: { database: { status: 'fail', code: 'DATABASE_UNAVAILABLE' } }
    });
    expect(JSON.stringify(response.body)).not.toContain('password');
    expect(JSON.stringify(response.body)).not.toContain('secret');
  });

  test('readiness returns 200 only when every required check passes', async () => {
    const app = appWithHealth(jest.fn().mockResolvedValue({
      ready: true,
      checks: {
        database: { status: 'pass' },
        migrations: { status: 'pass' },
        attachmentStorage: { status: 'pass' }
      }
    }));

    await request(app).get('/health/ready').expect(200, {
      status: 'ready',
      checks: {
        database: { status: 'pass' },
        migrations: { status: 'pass' },
        attachmentStorage: { status: 'pass' }
      }
    });
  });

  test('private HTTP probes bypass HTTPS enforcement while application traffic redirects', async () => {
    const app = appWithHealth(jest.fn().mockResolvedValue({ ready: true, checks: {} }));
    app.use(createHttpsEnforcement({
      environment: 'production',
      publicUrl: 'https://api.example.com'
    }));
    app.get('/private', (_req, res) => res.json({ ok: true }));

    await request(app).get('/health/live').expect(200);
    const redirect = await request(app).get('/private?next=1').expect(301);
    expect(redirect.headers.location).toBe('https://api.example.com/private?next=1');
    await request(app)
      .get('/private')
      .set('X-Forwarded-Proto', 'https')
      .expect(200, { ok: true });
  });

  test('does not serve cached readiness after graceful draining starts', async () => {
    let draining = false;
    const readinessCheck = jest.fn().mockImplementation(() => Promise.resolve(
      draining
        ? { ready: false, checks: { runtime: { status: 'fail', code: 'SERVER_DRAINING' } } }
        : { ready: true, checks: { database: { status: 'pass' } } }
    ));
    const app = express();
    app.use('/health', createHealthRouter({
      readinessCheck,
      readinessCacheMs: 60000,
      readinessTimeoutMs: 100,
      isDraining: () => draining
    }));

    await request(app).get('/health/ready').expect(200);
    draining = true;
    const response = await request(app).get('/health/ready').expect(503);
    expect(response.body.checks.runtime.code).toBe('SERVER_DRAINING');
    expect(readinessCheck).toHaveBeenCalledTimes(2);
  });
});
