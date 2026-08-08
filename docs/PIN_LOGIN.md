# Staff Quick PIN Login

VinAgent supports an optional quick PIN login for shared staff devices.

## Access Modes

- Manager login keeps the existing Firebase email/password flow and is still required for full manager and admin access.
- Staff access is shown by default after the device has previously used staff mode.
- Quick PIN uses a winery-scoped PIN. The PIN identifies the staff member, starts a short-lived session, and loads the normal staff view.
- If quick PIN is disabled for the winery, staff access falls back to the existing username/access-code flow.
- If manager basic PIN is enabled, managers can use a PIN, but the session is downgraded to staff-level access. Full manager pages still require manager login.

## Deployment Winery Context

The browser does not select the winery used for staff authentication.

- Set `DEPLOYMENT_WINERY_ID` on every production backend. It constrains Firebase, access-code, and PIN sessions to that winery and is changed only by a deployment operator. The exactly-one-winery fallback is for local development; public staff login fails closed when that fallback is ambiguous.
- Public PIN configuration, PIN login, and username resolution all use that server-controlled winery. Query/body winery IDs are ignored and are never tenant-routing inputs.
- Browser storage remembers only enough context to default the interface to staff mode and display the winery name. The backend response replaces that display context on every login-screen load.
- Logging out or an idle PIN lock clears the active session without changing the deployment winery.

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

PIN session tokens are stored in browser `localStorage` for the MVP kiosk flow. This keeps the browser-only frontend simple, but it means an XSS issue on the dashboard origin could read the active PIN session. The current compensating controls are short session lifetimes, idle lock clearing, staff-level role downgrading for manager PIN sessions, production-only strong `PIN_SESSION_SECRET`/`SESSION_SECRET` enforcement, and normal React escaping for rendered user content. Revisit secure HTTP-only same-site cookies before broad multi-tenant production rollout.
