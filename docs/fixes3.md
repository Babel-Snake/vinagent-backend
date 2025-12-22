These instructions translate the previous review feedback into concrete fixes. Apply them to ensure the SMS triage service matches the documented architecture (routes → controllers → services → models) and security/observability goals.

## 1. Harden webhook ingress
- **Provider validation:** Add signature or shared-secret verification for incoming SMS/webhook requests before processing. Reject requests that fail verification and log the attempt.
- **Schema validation:** Validate webhook payloads (e.g., sender, message body, metadata) using a schema validator and return 400 on malformed input. Sanitize user-supplied strings before persisting.
- **Abuse controls:** Apply dedicated rate limiting and, if available, IP allow-listing for public webhook endpoints. Keep these controls even though other routes are authenticated.

## 2. Ensure database is initialized before serving traffic
- Load Sequelize initialization during server boot so model definitions, associations, and `sequelize.authenticate()` run before request handling.
- Consider failing fast if the DB connection is unavailable on startup rather than serving routes with uninitialized models.

## 3. Tighten authorization and access controls
- Enforce role/permission checks on all non-public routes; document which endpoints are intentionally unauthenticated.
- For public endpoints (e.g., webhooks), compensate with the ingress hardening in section 1.
- Confirm Firebase token validation is centralized and that controllers rely on middleware, not inline token parsing.

## 4. Improve observability
- Add structured logs around task/message creation and other DB writes (include request correlation IDs or user IDs).
- Ensure request logging middleware is applied to all routes; verify error handler emits actionable context without leaking secrets.
- Consider minimal audit trails for admin-sensitive actions.

## 5. Stabilize AI triage behavior
- Default to deterministic heuristics or a mock adapter when no AI key is configured; avoid outbound AI calls without credentials.
- Surface a clear startup warning when AI is unavailable, and gate AI usage behind an explicit `AI_SKIP`/feature flag so environments without keys remain healthy.

## 6. General hygiene and documentation
- Keep the layered structure (routes → controllers → services → models) intact when implementing fixes.
- Update relevant docs to reflect new security checks, startup behavior, and observability expectations.