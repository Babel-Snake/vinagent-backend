import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nextBin = path.join(frontendRoot, 'node_modules', 'next', 'dist', 'bin', 'next');
const token = 'a'.repeat(64);

function browserExecutable() {
  const candidates = [
    process.env.PLAYWRIGHT_EXECUTABLE_PATH,
    process.platform === 'win32' && 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    process.platform === 'win32' && 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    process.platform === 'win32' && 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    process.platform === 'win32' && 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/microsoft-edge',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);

  const executable = candidates.find((candidate) => existsSync(candidate));
  if (!executable) {
    throw new Error('No supported local Edge/Chrome executable found. Set PLAYWRIGHT_EXECUTABLE_PATH.');
  }
  return executable;
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : null;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

async function waitForServer(origin, child) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Next server exited with code ${child.exitCode}.`);
    try {
      const response = await fetch(origin, { redirect: 'manual' });
      if (response.status > 0) return;
    } catch {
      // The server may still be binding the port.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Timed out waiting for the local production frontend.');
}

function json(route, body, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function testConfirmationFlow(browser, origin) {
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  const pageErrors = [];
  let submitted;
  page.on('pageerror', (error) => pageErrors.push(error));

  await page.route('**/api/public/address-update/validate', (route) => json(route, {
    member: { firstName: 'Alex' },
    currentAddress: {
      addressLine1: '1 Old Road',
      suburb: 'Adelaide',
      state: 'SA',
      postcode: '5000',
      country: 'Australia',
    },
    proposedAddress: {
      addressLine1: '2 New Road',
      suburb: 'Adelaide',
      state: 'SA',
      postcode: '5000',
      country: 'Australia',
    },
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  }));
  await page.route('**/api/public/address-update/confirm', async (route) => {
    submitted = route.request().postDataJSON();
    await json(route, { success: true });
  });

  await page.goto(`${origin}/confirm-address#token=${token}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Alex, confirm your address' }).waitFor();
  assert.equal(new URL(page.url()).hash, '', 'bearer token must be removed from the visible URL');
  assert.equal(new URL(page.url()).search, '', 'bearer token must not remain in the query string');
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    true,
    'confirmation page must not overflow a 375px viewport',
  );

  await page.getByLabel('Address line 1').fill('3 Confirmed Avenue');
  await page.getByLabel('I confirm this is the address I want the winery to keep on my account.').check();
  await page.getByRole('button', { name: 'Confirm address update' }).click();
  await page.getByTestId('confirm-address-success').waitFor();
  assert.equal(submitted?.token, token);
  assert.equal(submitted?.newAddress?.addressLine1, '3 Confirmed Avenue');
  assert.deepEqual(pageErrors, []);
  await page.close();

  const expired = await browser.newPage({ viewport: { width: 375, height: 812 } });
  await expired.route('**/api/public/address-update/validate', (route) => json(route, {
    error: { code: 'TOKEN_EXPIRED' },
  }, 410));
  await expired.goto(`${origin}/confirm-address#token=${token}`, { waitUntil: 'domcontentloaded' });
  await expired.getByTestId('confirm-address-expired').waitFor();
  assert.equal(new URL(expired.url()).hash, '');
  await expired.close();
}

async function testLockedLogin(browser, origin) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.route('**/api/public/pin-config', (route) => json(route, {
    wineryId: 1,
    wineryName: 'Pilot Winery',
    pinLoginEnabled: true,
    allowManagerBasicPin: false,
    pinIdleTimeoutSeconds: 300,
  }));
  await page.goto(`${origin}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByText('Pilot Winery', { exact: true }).first().waitFor();
  assert.equal(await page.getByText(/change winery/i).count(), 0);
  assert.equal(await page.locator('select').count(), 0, 'login must not expose a winery selector');
  await page.close();
}

function emptyPagination() {
  return { page: 1, pageSize: 20, total: 0, totalPages: 1 };
}

async function mockDashboardApi(page, profile) {
  await page.addInitScript((user) => {
    localStorage.setItem('vinagent_pin_session', JSON.stringify({
      token: 'browser-smoke-pin-token',
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      idleTimeoutSeconds: 300,
      user: {
        id: user.id,
        displayName: user.displayName,
        role: user.role,
        actualRole: user.role,
        authMode: 'pin',
        wineryId: user.wineryId,
        wineryName: user.wineryName,
      },
    }));
  }, profile);

  await page.route('**/api/**', (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/public/me') return json(route, { user: { ...profile, isPinSession: true } });
    if (pathname === '/api/notifications') return json(route, { notifications: [] });
    if (pathname === '/api/tasks') return json(route, { tasks: [], pagination: emptyPagination() });
    if (pathname === '/api/notices') return json(route, { notices: [], pagination: emptyPagination() });
    if (pathname === '/api/calendar') return json(route, []);
    if (pathname === '/api/projects') return json(route, { projects: [], pagination: emptyPagination() });
    if (pathname === '/api/operational-records') return json(route, { records: [], pagination: emptyPagination() });
    if (pathname === '/api/usage/summary') return json(route, {
      usage: {
        window: { start: '2026-07-08T00:00:00.000Z', end: '2026-08-08T00:00:00.000Z' },
        commercial: { lifecycleStatus: 'PILOT', planCode: 'pilot', billingProvider: 'none', meteringStartedAt: '2026-07-01T00:00:00.000Z' },
        current: { activeSeats: 4, storageBytes: 2048, members: 12 },
        activity: { activeUsers: 3, engagedSeconds: 7200, sessions: 8 },
        operations: { tasksCreated: 15, inboundMessages: 10, outboundMessages: 7 },
        eventMetrics: { 'ai.total_tokens': { quantity: 2400, eventCount: 4 } },
        counterMetrics: { 'api.requests': { eventCount: 120, durationMs: 3200 } },
        gaugeHistory: [],
      },
    });
    return json(route, {});
  });
}

async function testRoleNavigation(browser, origin, role) {
  const isManager = role === 'manager';
  const profile = {
    id: isManager ? 7 : 8,
    displayName: isManager ? 'Pilot Manager' : 'Pilot Staff',
    email: isManager ? 'manager@example.com' : 'staff@vinagent.internal',
    role,
    actualRole: role,
    authMode: 'pin',
    wineryId: 1,
    wineryName: 'Pilot Winery',
    canAccessWineryConfig: isManager,
  };

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error));
  await mockDashboardApi(page, profile);
  await page.goto(`${origin}/home`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('navigation', { name: 'Primary navigation' }).waitFor();
  await page.getByRole('heading', { name: 'Home' }).waitFor();

  assert.equal(await page.getByRole('link', { name: 'Customers' }).count(), isManager ? 1 : 0);
  assert.equal(await page.getByRole('link', { name: 'Insights' }).count(), isManager ? 1 : 0);
  assert.equal(await page.getByRole('link', { name: 'Usage' }).count(), isManager ? 1 : 0);
  assert.equal(await page.getByRole('link', { name: 'Winery configuration' }).count(), isManager ? 1 : 0);
  await page.getByRole('button', { name: 'Work' }).click();
  assert.equal(await page.getByRole('menuitem', { name: /Intake/ }).count(), isManager ? 1 : 0);
  assert.deepEqual(pageErrors, []);
  if (isManager) {
    await page.goto(`${origin}/usage`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Winery usage' }).waitFor();
    await page.getByText('Active seats', { exact: true }).waitFor();
    assert.equal(await page.getByText('4', { exact: true }).count(), 1);
  }
  await page.close();

  const mobile = await browser.newPage({ viewport: { width: 375, height: 812 } });
  await mockDashboardApi(mobile, profile);
  await mobile.goto(`${origin}/home`, { waitUntil: 'domcontentloaded' });
  await mobile.getByRole('button', { name: 'Menu', exact: true }).click();
  const dialog = mobile.getByRole('dialog', { name: 'Navigation' });
  await dialog.waitFor();
  assert.equal(await dialog.getByRole('link', { name: 'Customers' }).count(), isManager ? 1 : 0);
  assert.equal(await dialog.getByRole('link', { name: 'Usage' }).count(), isManager ? 1 : 0);
  assert.equal(
    await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    true,
    `${role} navigation must not overflow a 375px viewport`,
  );
  await mobile.getByRole('button', { name: 'Close navigation' }).last().click();
  await mobile.close();
}

async function main() {
  if (!existsSync(path.join(frontendRoot, '.next', 'BUILD_ID'))) {
    throw new Error('Production frontend build is missing. Run npm run build first.');
  }

  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  let serverOutput = '';
  const server = spawn(process.execPath, [nextBin, 'start', '-H', '127.0.0.1', '-p', String(port)], {
    cwd: frontendRoot,
    env: { ...process.env, NODE_ENV: 'production' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (chunk) => { serverOutput = `${serverOutput}${chunk}`.slice(-4_000); });
  server.stderr.on('data', (chunk) => { serverOutput = `${serverOutput}${chunk}`.slice(-4_000); });

  let browser;
  try {
    await waitForServer(origin, server);
    browser = await chromium.launch({ executablePath: browserExecutable(), headless: true });
    await testConfirmationFlow(browser, origin);
    await testLockedLogin(browser, origin);
    await testRoleNavigation(browser, origin, 'manager');
    await testRoleNavigation(browser, origin, 'staff');
    process.stdout.write('Browser smoke passed: public confirmation, fixed-winery login, manager/staff navigation, aggregate Usage dashboard, and 375px viewport checks.\n');
  } catch (error) {
    if (serverOutput) process.stderr.write(`${serverOutput.trim()}\n`);
    throw error;
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
}

await main();
