# ENGINEERING_GUIDE.md

This document explains **how to write code in the VinAgent project**.

It defines:

* Folder structure rules
* Naming conventions
* Code style
* Error handling
* Logging usage
* How to add routes, controllers, services, and models
* Testing expectations
* Git workflow

It is written for both **human developers** and **AI coding agents**.

---

## 1. Folder Structure Rules

All backend code lives under `/src`.

Planned structure:

```text
/src
  /config        # Configuration (DB, logger, environment)
  /routes        # Express route definitions
  /controllers   # HTTP controllers
  /services      # Business logic
  /models        # Sequelize models + index
  /middleware    # Express middleware
  /utils         # Pure helpers and shared functions
  /tests         # Test files (unit + integration)
```

### 1.1 General Rules

* Do **not** create new top-level directories without updating this guide.
* Keep controllers, services, and models in their respective folders.
* If unsure where something belongs, prefer `services` or `utils` rather than inventing a new layer.

---

## 2. Naming Conventions

### 2.1 Files

* Controllers: `something.controller.js`
* Services: `something.service.js`
* Models: `Something.js` (PascalCase, matching Sequelize model name)
* Routes: `something.routes.js`
* Middleware: `something.middleware.js`
* Utils: `something.util.js` or grouped as needed
* Tests: mirror the file under test, appending `.test.js`

Examples:

* `src/controllers/task.controller.js`
* `src/services/task.service.js`
* `src/models/Task.js`
* `src/routes/task.routes.js`
* `src/tests/task.controller.test.js`

### 2.2 Code Identifiers

* Variables and functions: `camelCase`
* Classes and Sequelize models: `PascalCase`
* Constants: `SCREAMING_SNAKE_CASE` (only if truly constant)

---

## 3. Code Style

### 3.1 General

* Use **modern JavaScript** (ES modules or CommonJS depending on project setup; default is CommonJS unless changed).
* Prefer **async/await** over raw Promises.
* Keep functions small and focused.
* Avoid deeply nested callbacks.

### 3.2 Linting & Formatting

* ESLint and Prettier will be used.
* Follow the configured lint rules (to be defined in `.eslintrc` and `.prettierrc`).
* Do not disable lint rules unless there is a strong reason; prefer fixing the code.

### 3.3 Imports

* Group imports:

  1. Node core modules
  2. External libraries
  3. Internal modules
* Avoid circular imports between services/controllers.

---

## 4. Controllers, Services, and Models

### 4.1 Controllers

Responsibilities:

* Handle HTTP layer details.
* Validate input (basic shape and required fields).
* Call the appropriate service functions.
* Translate service results into HTTP responses.
* Map errors into meaningful status codes.

Controllers **should not**:

* Contain complex business logic.
* Talk directly to Sequelize models (except in very simple cases).

Example pattern:

```js
// src/controllers/task.controller.js
const taskService = require('../services/task.service');

async function listTasks(req, res, next) {
  try {
    const { wineryId } = req.user; // from auth middleware
    const tasks = await taskService.getTasksForWinery(wineryId);
    res.json({ data: tasks });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listTasks,
};
```

### 4.2 Services

Responsibilities:

* Contain business rules and workflows.
* Coordinate between models, external APIs, and utils.
* Be testable without HTTP context.

Services **should not**:

* Know about Express `req`/`res`.
* Send HTTP responses directly.

Example pattern:

```js
// src/services/task.service.js
const { Task } = require('../models');

async function getTasksForWinery(wineryId) {
  return Task.findAll({ where: { wineryId } });
}

module.exports = {
  getTasksForWinery,
};
```

### 4.3 Models

Responsibilities:

* Define Sequelize models and relationships.
* Represent tables in the database.

Models **should not**:

* Contain complex business logic.
* Call external APIs.

Use migrations to change schemas. Do not modify DB structure manually.

---

## 5. Routes and Middleware

### 5.1 Routes

* Define Express routes in `/src/routes`.
* Use a dedicated file per area, e.g. `task.routes.js`, `webhook.routes.js`.
* Keep route files small: only route definitions and controller mapping.

Example:

```js
// src/routes/task.routes.js
const express = require('express');
const taskController = require('../controllers/task.controller');
const authMiddleware = require('../middleware/auth.middleware');

const router = express.Router();

router.use(authMiddleware.requireAuth);
router.get('/', taskController.listTasks);

module.exports = router;
```

### 5.2 Middleware

Common middleware types:

* Auth (`auth.middleware.js`)
* Request logging
* Error handling

Error handling middleware should:

* Log errors using the shared logger.
* Send a consistent JSON error response.

---

## 6. Error Handling

### 6.1 General Rules

* Do not swallow errors silently.
* Use `try/catch` in controllers and call `next(err)`.
* Services can throw errors; controllers decide how to respond.

### 6.2 Error Types

Use simple custom error patterns where helpful, e.g.:

* `NotFoundError`
* `ValidationError`
* `UnauthorizedError`

Controllers or a central error handler can map these to:

* `404` Not Found
* `400` Bad Request
* `401` Unauthorized
* `500` Internal Server Error

### 6.3 Error Responses

All error responses should follow a consistent shape (to be defined in `API_SPEC.md`), for example:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Email is required"
  }
}
```

---

## 7. Logging

A single shared logger is used throughout the app.

### 7.1 Usage

* Import the logger from `/src/config/logger` (exact path to be defined).
* Do **not** use `console.log` in production code.

Example:

```js
const logger = require('../config/logger');

logger.info('Task created', { taskId, wineryId });
logger.error('Failed to process webhook', { error: err.message });
```

### 7.2 What Not to Log

Never log:

* Full credit card numbers
* Raw authentication tokens
* Full `.env` contents
* Anything explicitly marked as sensitive in `DOMAIN_MODEL.md`

Log only what is needed to debug and audit.

---

## 8. Testing

### 8.1 General Principles

* New features must include tests.
* Bug fixes should include tests that fail before the fix and pass after.
* Prefer small, focused tests.

### 8.2 Types of Tests

* **Unit tests:** Test individual functions/services in isolation.
* **Integration tests:** Test controllers + DB + models together.
* **E2E tests (later):** Full flows through HTTP.

### 8.3 File Placement

* Mirror source structure under `/src/tests` or close to the code under test.
* Use `.test.js` suffix.

### 8.4 Running Tests

* All tests:

  ```bash
  npm test
  ```
* Watch mode:

  ```bash
  npm run test:watch
  ```

### 8.5 For AI Agents

When adding new code:

1. Read the relevant scenarios in `docs/TEST_PLAN.md` and `docs/COMPONENTS.md`.
2. Add or update Jest tests first.
3. Implement code until tests pass.

---

## 9. Git Workflow

### 9.1 Branching

* Main branch: `main`
* Feature branches: `feature/<short-description>`
* Bugfix branches: `fix/<short-description>`

Examples:

* `feature/sms-webhook-ingestion`
* `fix/task-status-transition`

### 9.2 Commits

* Keep commits small and focused.
* Use clear, descriptive messages:

  * `Add basic Task model and migration`
  * `Implement SMS webhook controller`
  * `Fix null member ID bug in triage service`

### 9.3 Pull Requests (for humans)

* Keep PRs small.
* Explain what changed and why.
* Mention any new env vars or migrations.

For solo development, PRs may be optional but the discipline of small, coherent changes is still valuable.

---

## 10. Agent-Specific Guidance (Codex, Copilot, etc.)

This section is **explicitly for AI coding agents**.

### 10.1 Obey the Structure

* Do not create new top-level directories.
* Place controllers, services, and models in their proper folders.
* Follow naming conventions.

### 10.2 Tests First

* When asked to implement a new feature, first:

  * Locate or create relevant tests.
  * Ensure tests describe the scenarios from `TEST_PLAN.md`.
* Then implement the minimal code to make tests pass.

### 10.3 No Unapproved Dependencies

* Do not add new npm packages unless explicitly requested.
* Prefer using existing libraries and utilities.

### 10.4 Safe Changes

* Do not change public API contract (routes, response shapes) unless the task explicitly requires updating `API_SPEC.md` and tests.
* When unsure about complex business rules, add a `// TODO:` comment instead of guessing.

### 10.5 Logging & Errors

* Use the shared logger, not `console.log`.
* Ensure all thrown errors are either handled or passed to the error middleware.

---

## 11. Webhook Provider Configuration

* Inbound email webhooks must include the header `x-email-webhook-signature` matching `EMAIL_WEBHOOK_SECRET`. In non-production environments the check can be skipped when the secret is unset, but production environments should always configure the secret.
* Voice webhooks are validated using the Twilio signature header when `TWILIO_AUTH_TOKEN` is present.

## 12. Updating This Guide

Any time we:

* Add a new layer or folder type
* Change naming conventions
* Adjust error or logging patterns

…this file should be updated to stay in sync.

This guide is the **single source of truth** for how code should be written in the VinAgent backend.
