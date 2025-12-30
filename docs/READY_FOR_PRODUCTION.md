# Ready for Production: Sprint Roadmap

**Project:** VinAgent Backend  
**Created:** 2025-12-28  
**Target:** Production-Ready MVP  
**Estimated Effort:** 3-5 Developer Days

---

## Overview

This document provides a detailed, actionable roadmap to bring the VinAgent backend from its current state (7/10) to production-ready status. Each item includes exact file locations, code examples, and acceptance criteria.

---

## Quick Reference: Priority Matrix

| Priority | Category | Items | Effort |
|----------|----------|-------|--------|
| 🔴 P0 | Security Blockers | 2 items | 0.5 day |
| 🟠 P1 | Failing Tests | 6 test suites | 1 day |
| 🟡 P2 | Missing Features | 4 items | 1 day |
| 🟢 P3 | Code Quality | 5 items | 0.5 day |
| 🔵 P4 | Production Hardening | 5 items | 1-2 days |

---

## Phase 1: Critical Security & Blockers (Day 1)

### 1.1 🔴 Verify Service Account Key Is Not Tracked

**Status:** ⚠️ Verify - `.gitignore` has entry but confirm file isn't in Git history

**File:** `src/config/serviceAccountKey.json`

**Current .gitignore entry:**
```gitignore
# Line 36 of .gitignore
src/config/serviceAccountKey.json
```

**Action Required:**

```bash
# Check if file is tracked in Git
git ls-files src/config/serviceAccountKey.json

# If output is non-empty, the file IS tracked despite .gitignore
# Remove from tracking (keeps local file):
git rm --cached src/config/serviceAccountKey.json
git commit -m "Remove service account key from version control"

# Verify file isn't in history (if it is, consider rotating credentials)
git log --oneline --all -- src/config/serviceAccountKey.json
```

**If file was ever committed:**
1. Revoke the key in Firebase Console → Project Settings → Service Accounts
2. Generate a new service account key
3. Update the local file (not tracked)
4. Update any deployment secrets/environment variables

**Acceptance Criteria:**
- [ ] `git ls-files src/config/serviceAccountKey.json` returns empty
- [ ] Firebase credentials rotated if previously exposed
- [ ] Deployment uses environment variables, not file

---

### 1.2 🔴 Add Missing Config Files

**Issue:** ESLint and Prettier configs referenced in docs but missing

**Create:** `.eslintrc.js`

```javascript
// .eslintrc.js
module.exports = {
  env: {
    node: true,
    es2021: true,
    jest: true
  },
  extends: ['eslint:recommended'],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module'
  },
  rules: {
    'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'prefer-const': 'error',
    'no-var': 'error'
  }
};
```

**Create:** `.prettierrc`

```json
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100
}
```

**Create:** `jest.config.js`

```javascript
// jest.config.js
module.exports = {
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/node_modules/'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/tests/**',
    '!src/config/serviceAccountKey.json'
  ],
  coverageDirectory: 'coverage',
  verbose: true,
  testTimeout: 30000
};
```

**Update:** `package.json` scripts

```diff
  "scripts": {
    "dev": "nodemon src/server.js",
    "start": "node src/server.js",
    "test": "jest",
    "test:unit": "jest --runInBand src/tests/unit",
    "test:int": "jest --runInBand src/tests/integration",
+   "lint": "eslint src --ext .js",
+   "lint:fix": "eslint src --ext .js --fix",
+   "format": "prettier --write \"src/**/*.js\""
  },
```

**Acceptance Criteria:**
- [ ] `npm run lint` executes without config errors
- [ ] `npm run format` formats code successfully
- [ ] Jest config is loaded from file

---

## Phase 2: Fix Failing Test Suites (Day 1-2)

### 2.1 🟠 Fix `webhooks.int.test.js` - Wrong Mock Path

**File:** `src/tests/integration/webhooks.int.test.js`

**Problem:** Mock path uses `../../src/models` but test is already inside `src/`

**Current Code (Line 3):**
```javascript
jest.mock('../../src/models', () => ({
    Message: { create: jest.fn() },
    Winery: { findOne: jest.fn() },
    Task: { create: jest.fn() },
    Member: { findOne: jest.fn() }
}));
```

**Fixed Code:**
```javascript
jest.mock('../../models', () => ({
    Message: { create: jest.fn(), findOne: jest.fn() },
    Winery: { findOne: jest.fn() },
    Task: { create: jest.fn() },
    Member: { findOne: jest.fn() },
    sequelize: {
        transaction: jest.fn(() => ({
            commit: jest.fn(),
            rollback: jest.fn(),
            finished: false
        }))
    }
}));
```

**Also fix Line 10:**
```javascript
// FROM:
jest.mock('../../src/services/triage.service', () => ({
// TO:
jest.mock('../../services/triage.service', () => ({
```

**Also fix Line 22-24:**
```javascript
// FROM:
const app = require('../../src/app');
const { Winery, Task, Member, Message } = require('../../src/models');
const triageService = require('../../src/services/triage.service');

// TO:
const app = require('../../app');
const { Winery, Task, Member, Message } = require('../../models');
const triageService = require('../../services/triage.service');
```

---

### 2.2 🟠 Fix `auth_hardening.test.js` - Test Ordering Issue

**File:** `src/tests/integration/auth_hardening.test.js`

**Problem:** Tests modify `process.env.ALLOW_TEST_AUTH_BYPASS` but the config module caches the value at load time.

**Solution:** Reset config between tests or reload the module.

**Add to top of file:**
```javascript
// Force config reload before each test
beforeEach(() => {
    jest.resetModules();
});
```

**Better Solution - Update test to properly reset state:**

```javascript
// auth_hardening.test.js - Complete rewrite
process.env.ALLOW_TEST_AUTH_BYPASS = 'false'; // Start disabled

const request = require('supertest');

describe('Auth Hardening Integration', () => {
    let app, sequelize, User, Winery, winery;

    beforeAll(async () => {
        // Import after setting env
        const models = require('../../models');
        sequelize = models.sequelize;
        User = models.User;
        Winery = models.Winery;
        app = require('../../app');

        await sequelize.sync({ force: true });
        winery = await Winery.create({
            name: 'Auth Test Winery',
            timeZone: 'Australia/Adelaide',
            contactEmail: 'auth@test.com'
        });
    });

    afterAll(async () => {
        await sequelize.close();
    });

    beforeEach(() => {
        // Reset bypass to disabled by default
        process.env.ALLOW_TEST_AUTH_BYPASS = 'false';
    });

    describe('Test Mode Bypass', () => {
        it('should REJECT mock-token when bypass is disabled', async () => {
            // Ensure bypass is off
            jest.resetModules();
            const freshApp = require('../../app');
            
            const res = await request(freshApp)
                .get('/api/tasks')
                .set('Authorization', 'Bearer mock-token');

            expect(res.status).toBe(401);
            expect(res.body.error.code).toBe('UNAUTHENTICATED');
        });

        it('should ACCEPT mock-token when bypass is enabled and user exists', async () => {
            // Create stub user first
            await User.findOrCreate({
                where: { email: 'stub@example.com' },
                defaults: {
                    email: 'stub@example.com',
                    role: 'manager',
                    wineryId: winery.id,
                    firebaseUid: 'stub-uid'
                }
            });

            // Enable bypass and reload
            process.env.ALLOW_TEST_AUTH_BYPASS = 'true';
            jest.resetModules();
            const freshApp = require('../../app');

            const res = await request(freshApp)
                .get('/api/tasks')
                .set('Authorization', 'Bearer mock-token');

            expect(res.status).toBe(200);
        });
    });
});
```

---

### 2.3 🟠 Fix Remaining Test Suites

For each failing suite, apply these patterns:

**Common Fix Pattern for Integration Tests:**

```javascript
// At TOP of test file, before any requires
process.env.ALLOW_TEST_AUTH_BYPASS = 'true';
process.env.NODE_ENV = 'test';

// Then require app and models
const request = require('supertest');
const app = require('../../app');
const { sequelize, Winery, User, WinerySettings } = require('../../models');

describe('Test Suite', () => {
    beforeAll(async () => {
        await sequelize.sync({ force: true });
        
        // Create base fixtures
        const [winery] = await Winery.findOrCreate({
            where: { id: 1 },
            defaults: { name: 'Test Winery', timeZone: 'UTC', contactEmail: 'test@test.com' }
        });
        
        await User.findOrCreate({
            where: { email: 'stub@example.com' },
            defaults: { firebaseUid: 'stub-uid', role: 'manager', wineryId: winery.id }
        });
        
        await WinerySettings.findOrCreate({
            where: { wineryId: winery.id },
            defaults: { enableSecureLinks: true, enableWineClubModule: true }
        });
    });

    afterAll(async () => {
        await sequelize.close();
    });
});
```

**Acceptance Criteria:**
- [ ] `npm test` shows 0 failing test suites
- [ ] All 49+ tests pass
- [ ] No console errors during test run

---

## Phase 3: Complete Missing Features (Day 2-3)

### 3.1 🟡 Address-Update Routes Already Implemented!

**Good News:** Upon investigation, the address-update routes ARE implemented and mounted:

**File:** `src/routes/public.routes.js` (Lines 15-16)
```javascript
// Member Self-Service (secured by MemberActionToken, not Firebase auth)
router.get('/address-update/validate', addressUpdateController.validateToken);
router.post('/address-update/confirm', addressUpdateController.confirmAddress);
```

**Mounted at:** `/api/public/address-update/*`

**Update API_SPEC.md** to reflect the correct paths:
```diff
- GET /address-update/validate
+ GET /api/public/address-update/validate
```

**Also clean up the commented route and unused file:**

**File:** `src/routes/index.js` (Lines 6, 24-25)

```diff
- // const addressUpdateRoutes = require('./addressUpdate'); // Placeholder
...
- // Member self-service (secured by MemberActionToken)
- // router.use('/', addressUpdateRoutes);
```

**Delete unused file:** `src/routes/addressUpdate.js` (duplicate of public.routes.js functionality)

---

### 3.2 🟡 Add Pagination to GET /tasks

**File:** `src/controllers/task.controller.js`

**Current `listTasks` function (Lines 5-38):**

```javascript
// Add pagination per API_SPEC.md
async function listTasks(req, res, next) {
    try {
        const { wineryId, role, id: userId } = req.user;
        const { status, type, priority, assignedToMe, page = 1, pageSize = 20 } = req.query;

        // Validate pagination
        const limit = Math.min(Math.max(parseInt(pageSize) || 20, 1), 100);
        const offset = (Math.max(parseInt(page) || 1, 1) - 1) * limit;

        const whereClause = { wineryId };

        if (status) whereClause.status = status;
        if (type) whereClause.type = type;
        if (priority) whereClause.priority = priority;

        // RBAC: Staff can only see their assigned tasks or unassigned tasks
        if (role === 'staff') {
            whereClause[Op.or] = [
                { assigneeId: userId },
                { assigneeId: null }
            ];
        } else if (assignedToMe === 'true') {
            whereClause.assigneeId = userId;
        }

        const { count, rows: tasks } = await Task.findAndCountAll({
            where: whereClause,
            include: [
                { model: Member, attributes: ['id', 'firstName', 'lastName'] },
            ],
            order: [['createdAt', 'DESC']],
            limit,
            offset
        });

        res.json({
            data: tasks,
            pagination: {
                page: parseInt(page) || 1,
                pageSize: limit,
                total: count,
                totalPages: Math.ceil(count / limit)
            }
        });
    } catch (err) {
        next(err);
    }
}
```

---

### 3.3 🟡 Refactor Controller Thickness

**Issue:** `listTasks` and `getTask` in task.controller.js contain direct model queries.

**Solution:** Move to taskService.js

**Add to `src/services/taskService.js`:**

```javascript
const { Task, Member, Message, User, WinerySettings } = require('../models');
const { Op } = require('sequelize');

/**
 * Get tasks for a winery with filtering and pagination
 */
async function getTasksForWinery({ wineryId, userId, userRole, filters = {}, pagination = {} }) {
    const { status, type, priority, assignedToMe } = filters;
    const { page = 1, pageSize = 20 } = pagination;
    
    const limit = Math.min(Math.max(parseInt(pageSize) || 20, 1), 100);
    const offset = (Math.max(parseInt(page) || 1, 1) - 1) * limit;

    const whereClause = { wineryId };

    if (status) whereClause.status = status;
    if (type) whereClause.type = type;
    if (priority) whereClause.priority = priority;

    if (userRole === 'staff') {
        whereClause[Op.or] = [
            { assigneeId: userId },
            { assigneeId: null }
        ];
    } else if (assignedToMe === 'true') {
        whereClause.assigneeId = userId;
    }

    const { count, rows } = await Task.findAndCountAll({
        where: whereClause,
        include: [
            { model: Member, attributes: ['id', 'firstName', 'lastName'] },
        ],
        order: [['createdAt', 'DESC']],
        limit,
        offset
    });

    return {
        tasks: rows,
        pagination: {
            page: parseInt(page) || 1,
            pageSize: limit,
            total: count,
            totalPages: Math.ceil(count / limit)
        }
    };
}

/**
 * Get a single task by ID
 */
async function getTaskById({ taskId, wineryId }) {
    const task = await Task.findOne({
        where: { id: taskId, wineryId },
        include: [
            { model: Member },
            { model: Message },
            { model: User, as: 'Creator', attributes: ['id', 'displayName'] }
        ]
    });

    if (!task) {
        const err = new Error('Task not found');
        err.statusCode = 404;
        err.code = 'NOT_FOUND';
        throw err;
    }

    return task;
}

module.exports = {
    createTask,
    updateTask,
    getTasksForWinery,  // NEW
    getTaskById         // NEW
};
```

**Update controller to use service:**

```javascript
// task.controller.js
async function listTasks(req, res, next) {
    try {
        const { wineryId, role, id: userId } = req.user;
        const { status, type, priority, assignedToMe, page, pageSize } = req.query;

        const result = await taskService.getTasksForWinery({
            wineryId,
            userId,
            userRole: role,
            filters: { status, type, priority, assignedToMe },
            pagination: { page, pageSize }
        });

        res.json({ data: result.tasks, pagination: result.pagination });
    } catch (err) {
        next(err);
    }
}

async function getTask(req, res, next) {
    try {
        const { wineryId } = req.user;
        const { id } = req.params;

        const task = await taskService.getTaskById({ taskId: id, wineryId });
        res.json({ task });
    } catch (err) {
        next(err);
    }
}
```

---

## Phase 4: Add Missing Tests (Day 3)

### 4.1 🟢 Create addressUpdateService Unit Tests

**Create:** `src/tests/unit/addressUpdateService.test.js`

```javascript
// src/tests/unit/addressUpdateService.test.js
const addressUpdateService = require('../../services/addressUpdateService');
const memberActionTokenService = require('../../services/memberActionTokenService');
const { Member, Task, TaskAction } = require('../../models');

jest.mock('../../services/memberActionTokenService');
jest.mock('../../models', () => ({
    Member: {
        sequelize: {
            transaction: jest.fn(() => ({
                commit: jest.fn(),
                rollback: jest.fn()
            }))
        }
    },
    Task: {},
    TaskAction: { create: jest.fn() }
}));

describe('addressUpdateService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('confirmAddress', () => {
        it('should update member address with valid token', async () => {
            const mockMember = {
                id: 42,
                firstName: 'Emma',
                lastName: 'Clarke',
                addressLine1: 'Old Address',
                save: jest.fn()
            };

            const mockTask = {
                id: 5001,
                status: 'AWAITING_MEMBER_ACTION',
                save: jest.fn()
            };

            const mockToken = {
                id: 8001,
                payload: {
                    addressLine1: '12 Oak Street',
                    suburb: 'Stirling',
                    postcode: '5152'
                }
            };

            memberActionTokenService.validateToken.mockResolvedValue({
                tokenRecord: mockToken,
                member: mockMember,
                task: mockTask
            });
            memberActionTokenService.markTokenUsed.mockResolvedValue();

            const result = await addressUpdateService.confirmAddress({
                token: 'test-token'
            });

            expect(result.member.id).toBe(42);
            expect(mockMember.save).toHaveBeenCalled();
            expect(mockTask.status).toBe('EXECUTED');
            expect(memberActionTokenService.markTokenUsed).toHaveBeenCalledWith(8001, expect.anything());
        });

        it('should throw error if no address to apply', async () => {
            memberActionTokenService.validateToken.mockResolvedValue({
                tokenRecord: { id: 1, payload: {} },
                member: { id: 1 },
                task: null
            });

            await expect(
                addressUpdateService.confirmAddress({ token: 'test' })
            ).rejects.toMatchObject({
                code: 'NO_ADDRESS'
            });
        });

        it('should throw error if member not found', async () => {
            memberActionTokenService.validateToken.mockResolvedValue({
                tokenRecord: { id: 1, payload: { addressLine1: 'Test' } },
                member: null,
                task: null
            });

            await expect(
                addressUpdateService.confirmAddress({ token: 'test' })
            ).rejects.toMatchObject({
                code: 'MEMBER_NOT_FOUND'
            });
        });
    });
});
```

---

### 4.2 🟢 Create memberActionTokenService Unit Tests

**Create:** `src/tests/unit/memberActionTokenService.test.js`

```javascript
// src/tests/unit/memberActionTokenService.test.js
describe('memberActionTokenService', () => {
    describe('createToken', () => {
        it('should create a token with correct expiry');
        it('should generate a unique random token string');
        it('should store the payload correctly');
    });

    describe('validateToken', () => {
        it('should return token, member, and task for valid token');
        it('should throw TOKEN_NOT_FOUND for unknown token');
        it('should throw TOKEN_EXPIRED for expired token');
        it('should throw TOKEN_ALREADY_USED for used token');
    });

    describe('markTokenUsed', () => {
        it('should set usedAt timestamp');
    });
});
```

---

### 4.3 🟢 Create E2E Golden Path Test

**Create:** `src/tests/integration/goldenPath.int.test.js`

```javascript
// src/tests/integration/goldenPath.int.test.js
// Full end-to-end test per GOLDEN_PATH.md

process.env.ALLOW_TEST_AUTH_BYPASS = 'true';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../../app');
const { sequelize, Winery, Member, User, Task, Message, MemberActionToken, TaskAction, WinerySettings } = require('../../models');

describe('Golden Path: Address Change Flow', () => {
    let winery, member, manager;

    beforeAll(async () => {
        await sequelize.sync({ force: true });

        // Setup per GOLDEN_PATH.md section 2
        winery = await Winery.create({
            id: 1,
            name: 'Sunrise Ridge Winery',
            timeZone: 'Australia/Adelaide',
            contactPhone: '+61123456789',
            contactEmail: 'hello@sunrise.com'
        });

        await WinerySettings.create({
            wineryId: 1,
            enableSecureLinks: true,
            enableWineClubModule: true
        });

        member = await Member.create({
            id: 42,
            wineryId: 1,
            firstName: 'Emma',
            lastName: 'Clarke',
            phone: '+61412345678',
            email: 'emma.clarke@example.com',
            addressLine1: '5 River Road',
            suburb: 'Crafers',
            state: 'SA',
            postcode: '5152',
            country: 'Australia'
        });

        manager = await User.create({
            id: 7,
            email: 'stub@example.com',
            wineryId: 1,
            role: 'manager',
            firebaseUid: 'stub-uid'
        });
    });

    afterAll(async () => {
        await sequelize.close();
    });

    it('completes the full address change flow', async () => {
        // Step 1: Inbound SMS
        const smsRes = await request(app)
            .post('/api/webhooks/sms')
            .send({
                From: '+61412345678',
                To: '+61123456789',
                Body: "Hi, I've moved. Please update my address to 12 Oak Street, Stirling 5152.",
                MessageSid: 'SM_GOLDEN_PATH_001'
            });

        expect(smsRes.status).toBe(200);
        const taskId = smsRes.body.taskId;

        // Step 2: Verify task created
        const listRes = await request(app)
            .get('/api/tasks?status=PENDING_REVIEW')
            .set('Authorization', 'Bearer mock-token');

        expect(listRes.status).toBe(200);
        expect(listRes.body.data.length).toBeGreaterThan(0);

        // Step 3: Approve task
        const approveRes = await request(app)
            .patch(`/api/tasks/${taskId}`)
            .set('Authorization', 'Bearer mock-token')
            .send({
                status: 'APPROVED',
                payload: {
                    addressLine1: '12 Oak Street',
                    suburb: 'Stirling',
                    state: 'SA',
                    postcode: '5152',
                    country: 'Australia'
                }
            });

        expect(approveRes.status).toBe(200);
        expect(approveRes.body.task.status).toBe('AWAITING_MEMBER_ACTION');

        // Step 4: Verify token created
        const token = await MemberActionToken.findOne({ where: { taskId } });
        expect(token).toBeDefined();
        expect(token.type).toBe('ADDRESS_CHANGE');

        // Step 5: Member validates token
        const validateRes = await request(app)
            .get(`/api/public/address-update/validate?token=${token.token}`);

        expect(validateRes.status).toBe(200);
        expect(validateRes.body.member.firstName).toBe('Emma');

        // Step 6: Member confirms address
        const confirmRes = await request(app)
            .post('/api/public/address-update/confirm')
            .send({
                token: token.token,
                newAddress: {
                    addressLine1: '12 Oak Street',
                    suburb: 'Stirling',
                    state: 'SA',
                    postcode: '5152',
                    country: 'Australia'
                }
            });

        expect(confirmRes.status).toBe(200);
        expect(confirmRes.body.status).toBe('ok');

        // Step 7: Verify final state
        const updatedMember = await Member.findByPk(42);
        expect(updatedMember.addressLine1).toBe('12 Oak Street');

        const updatedTask = await Task.findByPk(taskId);
        expect(updatedTask.status).toBe('EXECUTED');

        const actions = await TaskAction.findAll({ where: { taskId } });
        const actionTypes = actions.map(a => a.actionType);
        expect(actionTypes).toContain('EXECUTED');

        const usedToken = await MemberActionToken.findByPk(token.id);
        expect(usedToken.usedAt).not.toBeNull();
    });
});
```

---

## Phase 5: Production Hardening (Day 4-5)

### 5.1 🔵 Implement Proper HMAC for Retell Webhook

**File:** `src/middleware/webhookValidation.js` (Lines 46-86)

**Replace `validateRetellSignature`:**

```javascript
const crypto = require('crypto');

function validateRetellSignature(req, res, next) {
    const secret = process.env.RETELL_WEBHOOK_SECRET;

    if (!secret) {
        if (process.env.NODE_ENV === 'production') {
            logger.error('CRITICAL: RETELL_WEBHOOK_SECRET missing in production.');
            return res.status(500).json({ error: 'Server configuration error' });
        }
        logger.warn('Skipping Retell webhook signature validation (RETELL_WEBHOOK_SECRET missing)');
        return next();
    }

    const signature = req.headers['x-retell-signature'];
    if (!signature) {
        logger.warn('Missing Retell webhook signature header');
        return res.status(403).json({ error: 'Missing signature' });
    }

    try {
        // Compute HMAC-SHA256 of request body
        const payload = JSON.stringify(req.body);
        const computed = crypto
            .createHmac('sha256', secret)
            .update(payload)
            .digest('hex');

        // Timing-safe comparison
        const signatureBuffer = Buffer.from(signature, 'hex');
        const computedBuffer = Buffer.from(computed, 'hex');

        if (signatureBuffer.length !== computedBuffer.length ||
            !crypto.timingSafeEqual(signatureBuffer, computedBuffer)) {
            logger.warn('Invalid Retell webhook signature');
            return res.status(403).json({ error: 'Invalid signature' });
        }

        return next();
    } catch (err) {
        logger.error('Error validating Retell signature', err);
        return res.status(500).json({ error: 'Validation error' });
    }
}
```

---

### 5.2 🔵 Consider Express 4.x for Stability

**Issue:** Express 5.x is still in beta

**Option A: Stay on Express 5** (if features are needed)
- Document in README that Express 5 beta is intentionally used
- Monitor for stability issues

**Option B: Downgrade to Express 4** (recommended for production)

```bash
npm uninstall express
npm install express@4.21.0
```

**Note:** Express 5 changes route handling and error middleware. Test thoroughly after downgrade.

---

### 5.3 🔵 Add HTTPS/Trust Proxy Configuration

**File:** `src/app.js`

**Add after line 10:**

```javascript
// Trust proxy for HTTPS detection behind load balancers
if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
}

// Redirect HTTP to HTTPS in production
app.use((req, res, next) => {
    if (process.env.NODE_ENV === 'production' && 
        req.headers['x-forwarded-proto'] !== 'https') {
        return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
    next();
});
```

---

### 5.4 🔵 Clean Up Dead Code

**Files to clean:**

1. **Delete:** `src/routes/addressUpdate.js` (duplicate functionality)

2. **Remove from** `src/routes/index.js`:
   ```diff
   - // const addressUpdateRoutes = require('./addressUpdate'); // Placeholder
   - // Member self-service (secured by MemberActionToken)
   - // router.use('/', addressUpdateRoutes);
   ```

3. **Remove from** `src/services/triage.service.js` (Lines 165-184):
   ```diff
   - // Re-writing triageMessage to be cleaner:
   - /*
   - async function triageMessage(message, context = {}) {
   -     ...
   - */
   - // Let's do the AI First approach as it's the goal.
   ```

4. **Move require to top** in `task.controller.js`:
   ```javascript
   // Line 65-68 - move to top of file
   const triageService = require('../services/triage.service');
   const { validate, createTaskSchema, updateTaskSchema, autoclassifySchema } = require('../utils/validation');
   const taskService = require('../services/taskService');
   ```

---

### 5.5 🔵 Add Observability

**Add to `package.json`:**

```json
"dependencies": {
    "@opentelemetry/api": "^1.7.0",
    "@opentelemetry/auto-instrumentations-node": "^0.40.0"
}
```

**Create:** `src/config/telemetry.js`

```javascript
// Basic APM setup for production observability
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');

const sdk = new NodeSDK({
    instrumentations: [getNodeAutoInstrumentations()]
});

sdk.start();
```

---

## Verification Checklist

Before deploying to production, verify:

### Security
- [ ] `git ls-files src/config/serviceAccountKey.json` returns empty
- [ ] All webhook endpoints require valid signatures
- [ ] Firebase token validation includes issuer/audience checks
- [ ] Rate limiting is active
- [ ] CORS is configured for production domains

### Tests
- [ ] `npm test` passes with 0 failures
- [ ] All unit tests pass: `npm run test:unit`
- [ ] All integration tests pass: `npm run test:int`
- [ ] Golden Path E2E test passes

### Code Quality
- [ ] `npm run lint` shows no errors
- [ ] No console.log statements (except in logger)
- [ ] All dead code removed

### Functionality
- [ ] SMS webhook creates tasks correctly
- [ ] Email webhook creates tasks correctly
- [ ] Task approval triggers execution
- [ ] Address-update flow completes end-to-end
- [ ] Pagination works on GET /tasks

### Configuration
- [ ] All required env vars documented in .env.example
- [ ] jest.config.js in place
- [ ] .eslintrc.js in place
- [ ] .prettierrc in place

---

## Summary

| Phase | Focus | Effort | Status |
|-------|-------|--------|--------|
| 1 | Security & Config | 0.5 day | ⬜ Not Started |
| 2 | Fix Failing Tests | 1 day | ⬜ Not Started |
| 3 | Complete Features | 1 day | ⬜ Not Started |
| 4 | Add Missing Tests | 0.5 day | ⬜ Not Started |
| 5 | Production Hardening | 1-2 days | ⬜ Not Started |

**Total Estimated Effort:** 4-5 Developer Days

After completing this roadmap, the VinAgent backend will be ready for production deployment with:
- ✅ All security issues resolved
- ✅ 100% test pass rate
- ✅ Complete Golden Path implementation
- ✅ Proper code quality tooling
- ✅ Production-grade configuration
