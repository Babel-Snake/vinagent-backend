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
    *   Inputs: Winery Code (optional, or implicit from URL), Username ("Sarah"), Password ("1234").
    *   Frontend: Constructs the dummy email and authenticates against Firebase.
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
