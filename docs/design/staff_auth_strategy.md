# Staff Authentication Strategy - RFC

## Problem
Casual staff act as a barrier to entry if required to create personal Firebase accounts with email addresses.
Goal: Allow Admins to create "Internal Staff" users with simple credentials (no external email signup required).

## Options

### Option A: Managed Firebase Accounts (Recommended)
We continue to use Firebase Auth as the security backbone, but "mask" it from the Staff user.

**How it works:**
1.  **Creation**: Manager clicks "Add Staff".
    *   Inputs: Name (e.g. "Sarah"), Code/Password (e.g. "1234").
    *   System: Auto-generates a dummy email (e.g. `sarah@winery1.vinagent.internal`) and creates the Firebase User in the background.
2.  **Login**: Staff sees a simplified "Staff Login" screen.
    *   Inputs: Immutable username ("Sarah") and password/access code.
    *   The backend resolves that username only inside the deployment winery and returns the managed Firebase login identity. The browser never chooses a winery or constructs an identity from a client-supplied winery ID.
3.  **Security**: Inherits all Firebase protections (rate limiting, secure storage).

**Pros:**
*   **Secure**: No custom password hashing/storage risks.
*   **Unified**: Backend Middleware remains identical (verifies Firebase Tokens).
*   **Experience**: Staff never knows they have an "email".

**Cons:**
*   Need to ensure unique usernames (scoped by Winery).

### Option B: Custom Internal Auth
We build a parallel authentication system just for staff.

**How it works:**
1.  **Creation**: Manager saves `password_hash` to the `Users` table in MySQL.
2.  **Login**: Backend endpoint `/api/login` verifies hash and issues a custom JWT.
3.  **Middleware**: Must be updated to accept *either* Firebase Tokens *or* Custom JWTs.

**Pros:**
*   Total control over auth logic.

**Cons:**
*   **High Risk**: We become responsible for password security (hashing, salting, brute-force protection).
*   **Complex**: Dual auth paths in every API endpoint/middleware.
*   **Maintenance**: Two systems to debug.

## Recommendation
**Proceed with Option A**. It delivers the exact "Internal Password" experience requested but keeps the system secure and maintainable.

## Winery and identity binding

- Set `DEPLOYMENT_WINERY_ID` for each production deployment. It constrains every Firebase, access-code, and PIN session to that winery and is changed only by a deployment operator. A database containing exactly one winery can be resolved automatically for local development; zero or multiple candidates fail closed for public staff login.
- Firebase ID tokens are joined to application users by the stored, unique `firebaseUid`, never by mutable email.
- `Users.username` is immutable, normalized, and unique within a winery. Existing staff identities are backfilled deterministically from their managed login email, display name, email local-part, or staff ID; collisions receive a stable ID suffix so no login-capable staff account is left without a username.
- Ordinary profile and staff-management APIs do not accept winery, username, or login-email reassignment. A future cross-winery move must be a separate platform-administrator workflow with its own audit and relationship migration rules.
- Display names, roles, responsibilities, active status, passwords, and PINs can still be managed without changing the staff login identity.
