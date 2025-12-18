# VinAgent Backend Remediation Guide

This document summarizes the key gaps observed during the recent review so developers can address them systematically. Each item links the documented expectation to the current implementation and proposes remediation steps.

## 1) Input validation is missing on most endpoints
- **Expectation:** Controllers should perform basic request validation before delegating to services.【F:docs/ARCHITECTURE.md†L37-L48】【F:docs/ARCHITECTURE.md†L66-L88】
- **Current state:** `createTask` and `updateTask` accept many fields (status, payload, category, sentiment, suggested replies, assignments) without schema or type checks; only `autoclassify` checks for missing text.【F:src/controllers/task.controller.js†L58-L228】
- **Risks:** Malformed payloads or unexpected fields can be persisted, trigger execution when `status` is set to `APPROVED`, or poison audit logs.
- **Actions:** Add request schemas (e.g., Joi/Zod) for each controller, enforce allowed enums, validate nested payload shapes, and centralize error responses to match the API contract.

## 2) Controllers embed business logic instead of delegating to services
- **Expectation:** Controllers stay thin while services own business rules and side effects.【F:docs/ARCHITECTURE.md†L66-L88】
- **Current state:** `task.controller.js` performs task creation defaults, action logging, linking logic, status transition handling, and execution triggers directly inside controller methods instead of invoking a task domain service.【F:src/controllers/task.controller.js†L74-L228】
- **Risks:** Harder to test in isolation, duplicated rules across endpoints, and tighter coupling between HTTP layer and domain logic.
- **Actions:** Extract task creation/update flows (including TaskAction logging and execution triggers) into a dedicated service; keep controllers focused on validation, calling services, and formatting responses.

## 3) RBAC and authorization are not enforced beyond authentication
- **Expectation:** Requests must be filtered by role and winery scope via dedicated middleware (e.g., `requireRole`, `requireWineryScope`).【F:docs/RBAC Architecture.md†L146-L164】
- **Current state:** `authMiddleware` only checks token validity and user existence; no role checks or winery scoping helpers are applied on task routes. Controllers allow any authenticated user to mutate tasks, change statuses, or assign owners.【F:src/middleware/authMiddleware.js†L5-L78】【F:src/controllers/task.controller.js†L74-L228】
- **Risks:** Staff could approve/execute tasks, view other wineries’ data, or assign tasks without authorization, violating the RBAC matrix and tenant isolation guarantees.【F:docs/RBAC Architecture.md†L60-L120】
- **Actions:** Implement and wire RBAC middleware per the matrix (staff vs manager vs admin vs superadmin), enforce winery scoping on queries, and guard privileged transitions (e.g., APPROVED/EXECUTED, reassignment) with role checks.

## 4) Logging standards are inconsistently applied
- **Expectation:** Use the shared logger everywhere; avoid `console.*`.【F:docs/ENGINEERING_GUIDE.md†L259-L286】
- **Current state:** `triage.service.js` uses `console.warn` when AI classification fails instead of the shared logger.【F:src/services/triage.service.js†L31-L139】 Controllers and middleware mix logger usage with direct responses but lack structured log context for critical actions.
- **Risks:** Incomplete observability, difficulty correlating incidents, and noisy logs that bypass formatting or transports.
- **Actions:** Replace `console.*` with the shared logger, add structured context (taskId, wineryId, userId, action) around triage and task mutations, and ensure errors flow through centralized error handling.

## 5) Configuration defaults expose weak secrets in non-dev contexts
- **Expectation:** Production deployments should require explicit secrets and avoid insecure fallbacks.
- **Current state:** Database and Firebase settings silently fall back to hard-coded defaults (`vinagent` credentials, blank Firebase keys) when environment variables are absent.【F:src/config/index.js†L7-L22】
- **Risks:** Accidental deployment with test credentials, credential reuse across environments, and misleading startup success without real auth configuration.
- **Actions:** Fail fast in non-development environments when required env vars are missing; consider `.env.example` for local defaults and secure secret management for prod/stage.

## 6) Task mutation safeguards are minimal
- **Expectation:** Execution should remain human-in-the-loop with explicit safeguards.【F:docs/ARCHITECTURE.md†L49-L60】
- **Current state:** Updating a task to `APPROVED` immediately triggers execution without verifying intent origin or reviewer role, and payload replacements are not sanitized.【F:src/controllers/task.controller.js†L200-L228】
- **Risks:** Unauthorized or accidental approvals could execute side effects; malicious payloads could be propagated to execution or outbound communication layers.
- **Actions:** Require reviewer role checks before approval, confirm the task’s triage origin/state, audit who approved, and sanitize payload/suggested replies before execution. Consider a separate “ready for execution” flag with multi-step confirmation.

## 7) Missing validation/error normalization across the API
- **Expectation:** Consistent error shapes and validation responses per the engineering guide.【F:docs/ENGINEERING_GUIDE.md†L259-L286】
- **Current state:** Controllers send ad-hoc JSON errors; there is no shared validation/error utility, and many endpoints will fall through to generic error middleware for malformed input.【F:src/controllers/task.controller.js†L58-L228】
- **Risks:** Inconsistent client handling, reduced debuggability, and inability to enforce the documented API error contract.
- **Actions:** Introduce a validation/error module that standardizes response format (codes/messages), integrate it into controllers, and add tests to cover validation and authorization scenarios (see RBAC test requirements).【F:docs/RBAC Architecture.md†L194-L208】

---
Addressing these items will align the implementation with the documented architecture, improve tenant safety, and raise overall code quality.