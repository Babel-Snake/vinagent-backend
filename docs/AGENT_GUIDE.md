# AGENT_GUIDE.md

**This document is written specifically for AI coding agents** (OpenAI Codex, GitHub Copilot, GPT-based coding assistants).

It defines how you must behave when generating code, modifying the project, or responding to development prompts.

The goal is simple:

> **Produce correct, safe, consistent code that follows the VinAgent architecture and conventions every time.**

Follow these rules strictly unless the user explicitly instructs otherwise.

---

## 1. Your Mission

You are helping build the **VinAgent backend** — a Node.js/Express/MySQL service built using Sequelize, Firebase Auth, Jest tests, and strict structural conventions.

Your job is to:

* Read and follow all documentation in `/docs`.
* Write code that fits the project’s architecture.
* Respect the folder structure and naming conventions.
* Use tests to guide all implementation.
* Avoid guessing complex business logic (use TODOs instead).

---

## 2. Required Knowledge Before Writing Code

Before generating or editing code, **you must always do the following**:

1. Read the **README.md** for context.
2. Read the **ARCHITECTURE.md** file completely.
3. Read the **ENGINEERING_GUIDE.md** carefully.
4. Check the **COMPONENTS.md** file for the feature you are working on.
5. Check the **TEST_PLAN.md** for relevant scenarios.
6. Check the **DOMAIN_MODEL.md** and **API_SPEC.md** if the task touches data or endpoints.

If any required detail is missing or contradictory:

* **Do not guess.**
* Add a `// TODO:` comment and continue implementing what you *can*.

---

## 3. Strict Structural Rules

Follow these exactly:

### 3.1 File Placement

* Controllers go in `/src/controllers`.
* Services go in `/src/services`.
* Models go in `/src/models`.
* Routes go in `/src/routes`.
* Middleware goes in `/src/middleware`.
* Helpers/utilities go in `/src/utils`.
* Tests go in `/src/tests`, mirroring the structure of the code under test.

### 3.2 File Naming

Follow the naming rules from `ENGINEERING_GUIDE.md`:

* Controllers: `something.controller.js`
* Services: `something.service.js`
* Models: `Something.js`
* Routes: `something.routes.js`
* Tests: `something.controller.test.js`, etc.

### 3.3 No New Top-Level Directories

You must not create new top-level folders unless explicitly instructed.

---

## 4. Code Style Rules You Must Follow

### 4.1 JavaScript/Node

* Use **async/await**.
* Avoid callbacks.
* Use clear, small, focused functions.
* Follow lint rules (ESLint + Prettier). Do not disable rules unless asked.

### 4.2 Controllers

* Validate input.
* Call services for business logic.
* Wrap logic in `try/catch` and pass errors to `next(err)`.

### 4.3 Services

* Contain business logic.
* Never send HTTP responses.
* Return values or throw errors.

### 4.4 Models

* Define Sequelize models with correct fields.
* Use migrations for schema changes.

### 4.5 Logging

* Use the shared logger.
* Never use `console.log`.
* Never log sensitive data.

---

## 5. Testing Rules (Very Important)

### 5.1 Tests Come First

When asked to implement a feature, you **must first**:

1. Locate or create the corresponding test file.
2. Implement tests following the scenarios defined in `TEST_PLAN.md` and `COMPONENTS.md`.
3. Then write code until all tests pass.

This is mandatory.

### 5.2 Test Structure

* Prefer focused unit tests.
* Integration tests must hit real Sequelize models + DB.
* E2E tests are only added later.

### 5.3 Test Naming

Follow Jest conventions:

```js
describe('feature X', () => {
  it('should do Y', () => {})
});
```

### 5.4 If a Test Case Is Ambiguous

* Add a TODO comment.
* Do not invent business logic.

---

## 6. Behaviour Rules

These rules make sure your output is predictable, safe, and consistent.

### 6.1 Do Not Modify Public APIs Without Permission

* Routes
* Request/response shapes
* Error response shape

If these must change:

1. Update `API_SPEC.md`.
2. Update tests.
3. Update controllers.

### 6.2 Do Not Add New Dependencies

Unless the user clearly instructs you.

### 6.3 Ask for Missing Information (Using TODOs)

If you lack enough detail:

* Add comments explaining what is missing.
* Avoid filling gaps with assumptions.

### 6.4 No Dead Code

* Do not leave unused variables.
* Delete commented-out code unless intentionally left as a TODO.

### 6.5 Keep Code Small

Break larger logic into service functions or utils.

### 6.6 Follow Error Conventions

Errors should:

* Use consistent error types (e.g. ValidationError).
* Be passed to `next(err)` in controllers.
* Be logged through the shared logger in the error middleware.

---

## 7. Working With External APIs

### 7.1 Twilio / SMS

* Use the routes defined in `API_SPEC.md`.
* Validate payload structure.

### 7.2 Retell / Voice

* Accept webhook events defined in the spec.
* Do not implement custom behaviours unless defined.

### 7.3 OpenAI

* Calls must be made through a dedicated helper (e.g. `openai.service.js`).
* Never embed API keys in code.
* Follow prompt structures in the relevant docs.

---

## 8. Grounding Behaviour

Whenever you generate code:

* Ground yourself in the system architecture.
* Follow all rules in this guide.
* Refer back to `DOMAIN_MODEL.md` and `API_SPEC.md` for correctness.
* Use the thin vertical slice as a template for patterns.

If the user provides new instructions:

* Apply them immediately, even if they supersede existing guidelines.

---

## 9. Summary

As an AI coding agent, you must:

* Follow all documentation precisely
* Respect the architecture and folder structure
* Use tests-first development
* Keep code safe, clean, and grounded
* Avoid assumptions

Your output should always look like it was written by a disciplined senior engineer following a long-term plan.

If something is unclear, signal it with TODOs rather than inventing logic.

Welcome to VinAgent — now let’s build this system right.
