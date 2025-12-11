# VinAgent RBAC (Role-Based Access Control) Architecture

This document defines how user roles, permissions, and visibility rules function within the VinAgent multi-tenant system. It is intended for developers implementing authentication, authorization, and user-facing behavior.

---

# 1. Overview

VinAgent is a **multi-tenant platform** serving independent wineries. Each winery has its own operational staff and managers, while the VinAgent platform team requires system-wide oversight. This creates the need for a clear, enforceable RBAC model.

This RBAC system ensures:

* Secure isolation between wineries
* Appropriate permission levels for staff and managers
* Support for corporate wineries with multiple locations
* Full administrative visibility for platform operators

---

# 2. Roles Summary

VinAgent supports four roles, grouped into two scope levels:

## **Winery-Level Roles**

These users operate *within a single winery's workspace*.

### **1. staff**

Daily cellar door operators.

### **2. manager**

Supervisors who oversee all tasks inside their assigned winery.

## **Customer Corporate Role**

For winery groups with multiple locations.

### **3. admin**

Can operate across **multiple wineries belonging to the same owner**.

## **Platform-Level Role**

Internal to VinAgent.

### **4. superadmin**

VinAgent platform operators (you / developer team).
Has unrestricted system visibility.

---

# 3. Permissions Matrix

| Action                                 | staff          | manager          | admin                 | superadmin         |
| -------------------------------------- | -------------- | ---------------- | --------------------- | ------------------ |
| Create manual tasks                    | ✅              | ✅                | ✅                     | ✅                  |
| Autoclassify staff notes               | ✅              | ✅                | ✅                     | ✅                  |
| View own tasks                         | ✅              | ✅                | ✅                     | ✅                  |
| View all tasks in winery               | ❌ (optional)   | ✅                | ✅                     | ✅                  |
| Assign tasks to staff                  | ❌              | ✅                | ✅                     | ✅                  |
| Reassign tasks                         | ❌              | ✅                | ✅                     | ✅                  |
| Approve system-generated tasks         | ❌              | ✅                | ✅                     | ✅                  |
| Edit member data                       | ❌              | ✅ (tier-based)   | ✅                     | ✅                  |
| Create ORDER or ACCOUNT tasks manually | ❌              | ✅                | ✅                     | ✅                  |
| Change task categories/subtypes        | ❌              | ⚠️ (manager)     | ⚠️                    | ✅                  |
| Close/execute tasks                    | Their own only | All winery tasks | All assigned wineries | All tasks          |
| Link tasks (parent/child)              | Optional       | ✅                | ✅                     | ✅                  |
| Delete/archive tasks                   | ❌              | ⚠️ minimal       | ⚠️                    | 🔥 superadmin only |
| Access reporting                       | ❌              | ✅                | ✅                     | ✅                  |
| Manage users                           | ❌              | ❌                | Winery-level only     | GLOBAL             |
| View all wineries                      | ❌              | ❌                | Only assigned         | ALL                |

---

# 4. Role Scope Rules

## **staff**

* May only access tasks where:

  * `assigneeId = user.id`, OR
  * `assigneeId = null` (unassigned), OR
  * They created the task.
* Cannot modify or view manager-only fields.

## **manager**

* Full visibility of all tasks under their `wineryId`.
* Can assign/reassign tasks.
* Oversees ordering, escalations, and member-related issues.

## **admin** (Corporate user)

* Can operate across multiple wineries.
* Assigned wineries stored in a join table:

```
AdminWineries (
  userId INT,
  wineryId INT
)
```

* Managers still rule individual winery-level decisions.

## **superadmin** (VinAgent platform operator)

* Bypasses all winery scoping.
* Can view and manage *any* winery account.
* Used for:

  * Debugging
  * Onboarding new wineries
  * Billing management
  * Impersonation for support
  * Data integrity fixes
  * Platform-wide analytics

---

# 5. Required Database Fields

## **User Table**

Add/confirm:

```
role VARCHAR('staff' | 'manager' | 'admin' | 'superadmin')
wineryId INT NULL  // NULL for superadmin, staff/managers belong to one winery
```

## **AdminWineries Table** (for multi-site customers)

```
AdminWineries
- id
- userId (FK User)
- wineryId (FK Winery)
```

---

# 6. API Authorization Rules

### General Rule:

**Requests must be filtered by role AND winery scope unless user is superadmin.**

### Middleware Required:

```
requireRole(role)
requireAtLeast(role)
requireWineryScope()
```

### SuperAdmin Behavior:

* Skips winery scoping
* May include `?wineryId=` to inspect a specific tenant

---

# 7. UI / UX Expectations

### Staff

* "My Tasks" dashboard
* Limited edit capabilities
* No access to reporting

### Manager

* Full task board
* Assign/Unassign
* Approve system-generated tasks

### Admin

* Switch between wineries
* Review operational health across locations

### SuperAdmin

* Global dashboard (all wineries)
* Tenant impersonation
* System settings, billing, diagnostics

---

# 8. Test Plan Requirements

Tests must cover:

### Authentication

* Users with each role can login and receive correct role token metadata.

### Authorization

* staff cannot see tasks from other wineries.
* manager can see all tasks in their winery.
* admin can see tasks in assigned wineries but not others.
* superadmin can bypass all restrictions.

### Security Guards

* Assignment attempts by staff → 403
* Manager attempting to modify different winery → 403
* Superadmin always allowed

---

# 9. Summary

This RBAC architecture provides:

* Clear, minimal, powerful roles
* Strong multi-tenant isolation
* Smooth workflow for winery operations
* Scalable enterprise features for larger groups
* Full administrative power for VinAgent platform operators

This model should be implemented early in the development cycle to ensure all endpoints, UI decisions, and task workflows adhere to consistent permission boundaries.
