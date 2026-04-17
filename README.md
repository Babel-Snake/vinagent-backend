# VinAgent

VinAgent is an AI-assisted operations platform for winery teams. The current build centers on one core loop:

`inbound message -> triage -> task -> human action -> optional automation / secure member follow-up -> audit trail`

The repository now contains both:

* an Express backend in `src/`
* a Next.js dashboard in `frontend/`

The backend is the main source of truth for workflow behaviour.

## Current Product Shape

VinAgent ingests SMS, email, and voice events, turns them into structured tasks, drafts suggested replies/actions, and lets winery staff manage the work through a shared task system.

The current task model has two layers:

* coarse business outcome on `Task.status`
* structured operational progression through `TaskStep`

The task status enum is still intentionally coarse:

* `PENDING`
* `ACTIONED`
* `REJECTED`

More detailed workflow state is now represented through:

* `Task.workflowState` and related summary fields
* ordered `TaskStep` records inside the task
* `TaskAction` records for the immutable audit trail
* `MemberActionToken` records for secure self-service flows

Initial step plans are now sourced from a centralized workflow-template registry in `src/services/taskWorkflowTemplates.js`. AI can still propose steps, but the backend always has deterministic subtype/category templates to fall back on.

Example: an address-change task starts `PENDING`, triage proposes a step plan, a manager actions it, the system creates a secure token and sends the member a link, the task returns to `PENDING` while the workflow is `WAITING`, and becomes `ACTIONED` again once the member confirms.

## Repository Layout

```text
/
  docs/          Project docs and contracts
  frontend/      Dashboard and public flows
  scripts/       Local utilities
  src/           Express API, models, services, tests
```

Key backend areas:

* `src/routes` - route surface under `/api`
* `src/controllers` - HTTP orchestration
* `src/services` - business logic
* `src/models` - Sequelize models
* `src/tests` - unit and integration coverage

## Getting Started

1. Install dependencies:

```bash
npm install
```

2. Copy environment variables from `.env.example` to `.env` and fill in local values.

3. Create the database and run migrations:

```bash
npx sequelize db:migrate
```

4. Run the test suite:

```bash
npm test
```

5. Start the API:

```bash
npm run dev
```

Health endpoints:

* `GET /`
* `GET /health`
* `GET /api/health`

## Useful Scripts

```bash
npm test
npm run test:unit
npm run test:int
npm run lint
npm run format
```

## Core Docs

Start here if you need the current backend contract:

* `docs/ARCHITECTURE.md`
* `docs/DOMAIN_MODEL.md`
* `docs/API_SPEC.md`
* `docs/TASK_WORKFLOW_PLAN.md`
* `docs/GOLDEN_PATH.md`
* `docs/TEST_PLAN.md`

Supporting references:

* `docs/COMPONENTS.md`
* `docs/AUDIT_LOGGING.md`
* `docs/SETUP_BEGINNER.md`
* `docs/ROADMAP.md`

## Development Notes

The implementation now uses a simplified task status model plus a structured workflow-step layer. In tests, the AI service defaults to a deterministic mock adapter even if `OPENAI_API_KEY` is present. Only opt into live AI during tests when `AI_ALLOW_LIVE_TESTS=true`.

When in doubt, prefer the live backend implementation over older wording in historical docs, and keep docs/tests aligned to the running code.
