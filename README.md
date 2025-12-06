# VinAgent

**VinAgent** is an AI-powered "Digital Concierge" for winery clubs. It sits between a winery's communication channels (phone, SMS, email) and its existing systems, helping staff manage member admin, tasting enquiries, and common requests with less stress and less manual work.

Instead of staff spending Monday mornings digging through emails and missed calls, VinAgent:

* Receives messages and calls
* Understands what the customer wants
* Creates tasks and drafted replies
* Lets a human manager approve or edit those tasks
* Executes safe changes (like updating an address)

The goal is **"Monday Morning Peace"** for cellar door and wine club managers.

---

## 1. Project Status

* **Stage:** Early development / MVP
* **Focus:** Backend service (API + logic) for triage, tasks, and integrations
* **Primary user:** Winery staff (managers, admin, wine club coordinators)
* **Future plan:** Web dashboard frontend + deeper integrations (e.g. Commerce7, WineDirect)

---

## 2. High-Level Features (Planned MVP)

### 2.1 Message Ingestion

* Accept inbound messages from:

  * SMS (via Twilio or similar)
  * Email (via webhook / mail processor)
  * Voice calls (via Retell / Twilio webhooks)

### 2.2 Triage Engine

* Analyse each message to decide what it is about (intent)
* Examples:

  * Address change
  * Payment problem
  * Tasting booking request
  * General question

### 2.3 Task System

* Convert each message into a structured **Task**
* Store tasks in the database with:

  * Type
  * Status
  * Linked member / winery
  * Original message context

### 2.4 Human-in-the-Loop Workflow

* Manager views a list of tasks
* Approves or edits the suggested action
* System then executes safe tasks (e.g. update address, send confirmation message)

### 2.5 Logging & Observability

* Structured logging for requests and task actions
* Tracing of what was changed and when

Future phases will expand this with proactive features like delivery monitoring, weather-based shipping holds, and VIP detection.

---

## 3. Tech Stack

### Backend

* **Node.js** (LTS)
* **Express** for the HTTP API
* **Sequelize** as ORM
* **MySQL** as primary database

### Auth

* **Firebase Authentication** for user identity and access control

### Testing

* **Jest** as the main test runner

### Logging

* A shared logger (e.g. Winston or Pino), configured centrally and used everywhere

### Agentic Coding

* The project is designed to work well with:

  * OpenAI Codex / GPT-based coding agents
  * GitHub Copilot

The codebase is structured to give agents clear rules and tests so they can safely generate code.

---

## 4. Repository Structure (High-Level)

Planned structure (may evolve):

```text
/ (root)
  README.md
  package.json
  jest.config.js
  .eslintrc.cjs (or similar)
  .prettierrc
  .env.example
  /docs
    SETUP_BEGINNER.md
    ARCHITECTURE.md
    ENGINEERING_GUIDE.md
    AGENT_GUIDE.md
    COMPONENTS.md
    TEST_PLAN.md
    DOMAIN_MODEL.md
    API_SPEC.md
    GOLDEN_PATH.md
  /src
    /config
    /controllers
    /services
    /models
    /routes
    /middleware
    /utils
    /tests
```

See `docs/ENGINEERING_GUIDE.md` for the exact rules on where new files live.

---

## 5. Getting Started

If you are new to the project, start here:

1. Read `docs/SETUP_BEGINNER.md` and complete the environment setup.
2. Run the development server and confirm `/health` works.
3. Read `docs/ARCHITECTURE.md` to understand the big picture.
4. Read `docs/COMPONENTS.md` to see how the system is broken down.

For day-to-day coding rules, see `docs/ENGINEERING_GUIDE.md`.

For AI agents (Codex, Copilot, etc.), see `docs/AGENT_GUIDE.md`.

---

## 6. Development Philosophy

The project follows a few simple principles:

1. **Human-in-the-loop by design**

   * AI suggests; humans approve.

2. **Test-driven slices**

   * Each new feature starts with test cases.
   * Thin vertical slices are preferred over large rewrites.

3. **Clear boundaries**

   * Controllers handle HTTP.
   * Services hold business logic.
   * Models handle persistence.

4. **No silent failures**

   * Errors are logged clearly.
   * Failing tests are treated as blockers.

5. **Privacy and safety**

   * Do not log sensitive data (e.g. full card numbers, auth tokens).
   * Follow security notes in `docs/ARCHITECTURE.md` and `docs/ENGINEERING_GUIDE.md`.

---

## 7. Tests

* Run all tests:

  ```bash
  npm test
  ```
* Run tests in watch mode:

  ```bash
  npm run test:watch
  ```

See `docs/TEST_PLAN.md` for:

* What should be tested
* Types of tests (unit, integration, E2E)
* How to add new test cases

---

## 8. Contributing (Humans and Agents)

### For Human Contributors

* Follow `docs/SETUP_BEGINNER.md` to set up your environment.
* Read `docs/ENGINEERING_GUIDE.md` before writing code.
* Keep PRs small and focused on one component or feature.

### For AI Agents (Codex, etc.)

* Always read `docs/AGENT_GUIDE.md` before generating code.
* Respect existing folder structure and naming conventions.
* Update or create tests for all new behaviour.
* Avoid introducing new dependencies unless necessary.

---

## 9. Roadmap (Short Version)

1. **Phase 0:** Documentation + repo bootstrap
2. **Phase 1:** Thin vertical slice (SMS webhook → Task → List tasks)
3. **Phase 2:** Full triage engine + multi-channel ingestion
4. **Phase 3:** Integrations (Twilio, Retell, email provider)
5. **Phase 4:** Dashboard API
6. **Phase 5:** Deployment + monitoring

For the detailed plan, see `docs/VinAgent Project Master Plan` (or equivalent master planning document).

---

## 10. Contact

This is currently a solo-founder project in active development.

If you are reading this as a collaborator, agent, or future maintainer:

* Start with the docs.
* Keep changes small.
* Let the tests guide you.

Welcome to VinAgent.
