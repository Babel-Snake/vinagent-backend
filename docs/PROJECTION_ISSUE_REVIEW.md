# Projection Issue Review Lifecycle

Status: manager review queue, acknowledgement, typed resolution, ignore, tenancy, idempotency, and audit implemented

## Purpose

`ProjectionIssue` is VinAgent's durable record of canonical data that could not be interpreted safely. It is
not a second Task queue and it does not grant an operator permission to improvise provider data. The review
lifecycle gives a winery manager a controlled way to inspect an issue, acknowledge ownership, and record a
domain-specific decision without weakening projection safety.

This first typed resolver slice covers issues created by the legacy integration compatibility backfill. Other
issue types remain visible and may be explicitly ignored, but cannot be marked resolved until their domain
registers a resolver that validates the proposed decision.

## State model

```text
OPEN -> ACKNOWLEDGED -> RESOLVED
  |          |
  +----------+-------> IGNORED
```

- `OPEN` is newly detected or re-observed machine/data-quality state.
- `ACKNOWLEDGED` records the manager and time taking ownership; it remains non-terminal.
- `RESOLVED` requires a registered typed resolver and stores its normalized decision.
- `IGNORED` is an explicit manager decision that the issue does not require corrective action.
- `RESOLVED` and `IGNORED` are terminal. A later materially different observation must create or reopen the
  appropriate issue through the producing projector rather than rewriting review history.

Every transition requires a UUID v4 `requestId` and a meaningful reason. Repeating the same request for the
same issue returns the recorded result without another transition or audit event. Reusing it for another
issue is rejected.

## Manager API

All routes require a winery-scoped manager or admin. Issue reads and transitions are tenant-scoped, and
returned evidence/candidate data passes through the normal sanitizer.

- `GET /api/integration-management/projection-issue-resolvers`
- `GET /api/integration-management/projection-issues`
- `GET /api/integration-management/projection-issues/:issueId`
- `POST /api/integration-management/projection-issues/:issueId/acknowledge`
- `POST /api/integration-management/projection-issues/:issueId/resolve`
- `POST /api/integration-management/projection-issues/:issueId/ignore`

The list endpoint accepts `page`, `pageSize`, `status`, `severity`, `issueType`, and `connectionId`. Status and
severity default to `ALL`.

Acknowledgement and ignore use the controlled-operation body:

```json
{
  "requestId": "11111111-1111-4111-8111-111111111111",
  "reason": "Reviewed the source mapping with the cellar-door manager."
}
```

Typed resolution adds `decision` and, where required, `selectedConnectionKey`:

```json
{
  "requestId": "22222222-2222-4222-8222-222222222222",
  "reason": "Both records are intentionally separate provider accounts.",
  "decision": "KEEP_SEPARATE"
}
```

## Registered legacy mapping decisions

| Issue type | Accepted decisions | Selected connection required |
| --- | --- | --- |
| `CONNECTION_MAPPING_AMBIGUOUS` | `KEEP_SEPARATE`, `SELECT_CANDIDATE`, `LEGACY_SOURCE_CORRECTED` | only for `SELECT_CANDIDATE` |
| `CONNECTION_MAPPING_STALE` | `RETAIN_CANDIDATE`, `LEGACY_SOURCE_CORRECTED` | only for `RETAIN_CANDIDATE` |
| `SOURCE_CONFLICT` from the legacy backfill | `RETAIN_EXISTING`, `LEGACY_SOURCE_CORRECTED` | only for `RETAIN_EXISTING` |

A selected key must already be one of the issue's candidate keys and must identify a connection belonging to
the same winery. A generic `SOURCE_CONFLICT` from another projector cannot accidentally use the legacy
resolver because its source version is checked.

## Audit and mutation boundary

Transitions append one of:

- `PROJECTION_ISSUE_ACKNOWLEDGED`
- `PROJECTION_ISSUE_RESOLVED`
- `PROJECTION_ISSUE_IGNORED`

Audit snapshots contain lifecycle metadata and the normalized decision, but omit source evidence and
candidates. A typed decision is recorded on the issue; it does **not** automatically merge connections,
change authority, edit legacy JSON, or move credentials. Those effects require separate, validated domain
operations. This prevents a review action from becoming an implicit data migration.

## Extending the registry

Each new canonical domain should register a handler for only the issue types it owns. A handler must validate
the issue lineage, accepted decision vocabulary, referenced resources, winery ownership, and any safe domain
mutation inside the supplied transaction. Until such a handler exists, managers can acknowledge or ignore an
issue but a resolve request fails closed with
`PROJECTION_ISSUE_RESOLUTION_UNAVAILABLE`.

