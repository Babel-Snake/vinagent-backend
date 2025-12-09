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

## Phase 5: Operations & Tiers (The "Business Logic" Upgrade)
**Goal:** Enable product tiering, unified task classification, and manual operations.

*   [x] **5.1 Winery Settings & Feature Flags**
    *   *Create `WinerySettings` model (enableWineClub, enableSecureLinks, tier).*
*   [ ] **5.2 Unified Task Classification**
    *   *Refactor Task Data Model: Add `category`, `subType`, `customerType`.*
    *   *Migration: generic `type` -> `category/subType`.*
*   [ ] **5.3 Manual Task Operations**
    *   *Update `POST /tasks` for new fields.*
    *   *Update `PATCH /tasks/:id` for editing payload/notes.*
    *   *Add actions: `MANUAL_CREATED`, `MANUAL_UPDATE`, `STATUS_CHANGED`.*
*   [ ] **5.4 Tier-Aware Triage & Execution**
    *   *Update Triage to derive Category/SubType.*
    *   *Downgrade Advanced SubTypes to General for Basic Tier.*
    *   *Update Execution to handle new SubTypes.*

## Phase 6: AI-Powered Intelligence (The "Brain" Upgrade)
**Goal:** Replace rule-based logic with LLM-based intent detection, designed to be **Model Agnostic**.

*   [ ] **6.1 AI Service Adapter**
    *   *Create abstract `AIService` interface.*
    *   *Implement OpenAI Adapter (swappable for Claude/Local/DeepSeek).*
*   [ ] **6.2 LLM Triage Engine**
    *   *Replace keyword matching with LLM structured output.*
*   [ ] **6.3 RAG Knowledge Base**
    *   *Ingest PDF/Doc files for answering "General Inquiries".*

## Phase 7: Member Dashboard & Frontend (The "Face")
**Goal:** Give Winery Managers a UI to view and act on tasks.

*   [ ] **7.1 Next.js Application Setup**
    *   *Setup Shadcn/UI (deferred from initial setup).*
*   [ ] **7.2 Authentication UI**
    *   *Firebase Login/Logout pages.*
*   [ ] **7.3 Task Review Interface**
    *   *Update Task List/Detail to support Manual Editing fields.*

## Phase 8: Production Hardening (The "Shield")
**Goal:** Prepare for real-world deployment.

*   [ ] **8.1 Real Authentication**
    *   *Replace hardcoded `authMiddleware`.*
*   [ ] **8.2 Security & Rate Limiting**
    *   *Implement Helmet, CORS strictness.*
*   [ ] **8.3 Deployment Pipeline**
    *   *Containerize application (Podman).*
    *   *CI/CD workflows.*

## Phase 9: Expanded Reach
**Goal:** Support Email and Voice channels.

*   [ ] **9.1 Postmark/SendGrid Inbound**
*   [ ] **9.2 Voice AI (Retell)**


