# Staff Quick PIN Login

VinAgent supports an optional quick PIN login for shared staff devices.

## Access Modes

- Manager login keeps the existing Firebase email/password flow and is still required for full manager and admin access.
- Staff access is shown by default once the device has a configured winery.
- Quick PIN uses a winery-scoped PIN. The PIN identifies the staff member, starts a short-lived session, and loads the normal staff view.
- If quick PIN is disabled for the winery, staff access falls back to the existing username/access-code flow.
- If manager basic PIN is enabled, managers can use a PIN, but the session is downgraded to staff-level access. Full manager pages still require manager login.

## Device Winery Context

The login screen remembers the last winery used on the device.

- A successful manager/full login stores the user's winery ID and winery name in browser storage.
- Future visits to the login screen default to staff access for that winery.
- Staff do not need to enter a winery ID once the device context is set.
- Logging out or an idle PIN lock clears only the active session, not the device winery context.
- Use `Change winery` on the login screen to clear the device context and require a manager to sign in again.

## Settings

Managers can configure PIN login from `Winery > Staff & Access`.

- `Enable quick PIN`: allows staff with an assigned PIN to log in.
- `Manager basic PIN`: allows managers with an assigned PIN to enter the staff/basic view.
- `Idle lock`: clears the PIN session after inactivity.
- `Session length`: hard expiry for the PIN token.
- `Failed attempts`: incorrect PIN attempts before a temporary lockout.
- `Lockout`: lockout duration after too many incorrect attempts.

## Staff PINs

PINs are assigned or reset from each staff member's action menu in `Staff & Access`.

- PINs must be 4 to 12 letters or numbers.
- PINs must be unique within a winery.
- PINs are hashed before storage; the original PIN is only shown at creation/reset time.
- Clearing a PIN removes quick PIN access for that person without affecting their normal access code.

## Security Notes

PIN login is designed for convenience on trusted staff devices, not for elevated administration. Keep short idle timeouts enabled, use manager login for manager/admin work, and rotate a staff member's PIN if a shared device is lost or a PIN is disclosed.
