# ROADMAP.md

This document maps the implementation of components defined in `COMPONENTS.md` into logical execution phases. It serves as the master checklist for the project build.

---

## Phase 1: Project Foundation (The Skeleton)
**Goal:** Establish a working server, database connection, and core plumbing (logging/errors).

*   [ ] **1.1 Core Project Skeleton** (Component 0.1)
    *   *Initialize Node, Express, Jest, Linting.*
*   [ ] **1.2 Database Infrastructure** (Component 0.2)
    *   *Sequelize setup, migrations config, database connection.*
*   [ ] **1.3 Observability Layer** (Components 8.1, 8.2)
    *   *Shared logger setup, centralized error handling middleware.*

## Phase 2: Core Domain Models (The Data Layer)
**Goal:** Define the database schema and basic CRUD services for the core entities.

*   [ ] **2.1 User & Auth** (Components 1.1, 1.2)
    *   *Firebase Auth middleware, User model.*
*   [ ] **2.2 Winery & Context** (Component 2.1)
    *   *Winery model and service.*
*   [ ] **2.3 Members** (Component 2.2)
    *   *Member model and lookup services.*
*   [ ] **2.4 Messaging Domain** (Components 4.1, 4.2, 4.3)
    *   *Message model, Task model, TaskAction model.*

## Phase 3: Ingestion & Triage (The "Brain")
**Goal:** Receive real data and make decisions about it.

*   [ ] **3.1 Triage Engine (MVP)** (Component 5.1)
    *   *Service for determining intent from text (keyword/rule-based).*
*   [ ] **3.2 SMS Ingestion** (Component 3.1)
    *   *Webhook endpoint for Twilio, normalizing payload to Message.*

## Phase 4: Task Management & Execution (The "Hands")
**Goal:** Allow human review and execute the approved actions.

*   [ ] **4.1 Task API** (Component 6.1)
    *   *Endpoints to list and retrieve tasks.*
*   [ ] **4.2 Task Operations** (Component 6.2)
    *   *Endpoints to approve/reject tasks.*
*   [ ] **4.3 Execution Logic** (Component 7.1)
    *   *Logic to actually update Member data upon task approval.*

---

## Future Phases (Post-MVP)

*   **Phase 5: Expanded Channels** (Email 3.2, Voice 3.3)
*   **Phase 6: AI Intelligence** (AI Triage 5.2, Drafting)
*   **Phase 7: Outbound Messaging** (Confirmation messages 7.2)
