# Email Inbox Integration

This document describes the MVP email integration path for reading winery inboxes and sending task follow-up emails. The first live provider is Outlook / Microsoft 365 through Microsoft Graph. The implementation is provider-based so another winery can later use a different email provider without changing the task workflow.

## MVP Scope

Implemented:

- Store the winery's selected email provider in `WineryIntegrationConfig.emailProvider`.
- Store provider-specific email connection metadata in `WineryIntegrationConfig.providerConnections.email`.
- Test whether Outlook has the required server credentials and mailbox address configured.
- Manually sync an Outlook inbox from the winery integrations screen.
- Optionally run the Outlook inbox sync scheduler.
- Deduplicate imported email messages by external provider ID.
- Store inbound messages in `Messages`.
- Triage inbound email into the existing task creation flow.
- Send approved/actioned email replies through the configured email provider.

Not implemented yet:

- Per-winery OAuth consent flow.
- Encrypted per-winery credential storage.
- Gmail, IMAP, Mailgun inbound, or SES inbound adapters.
- Microsoft Graph delta sync.
- Attachments, inline images, read/unread marking, labels, folders beyond one configured folder, and reply threading.

## Outlook Provider Setup

The MVP uses Microsoft Graph with the client credentials flow. The app obtains a token from Microsoft identity using the tenant ID, client ID, client secret, and `https://graph.microsoft.com/.default` scope.

Microsoft references:

- List mailbox messages: https://learn.microsoft.com/en-us/graph/api/user-list-messages?view=graph-rest-1.0
- Send email: https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0
- Client credentials flow: https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-client-creds-grant-flow
- Limit app access to Exchange mailboxes: https://learn.microsoft.com/en-us/graph/auth-limit-mailbox-access

Create a Microsoft Entra app registration and grant Microsoft Graph application permissions:

- `Mail.Read` for inbox sync.
- `Mail.Send` for outbound task replies.

An administrator must grant consent. Because application permissions can otherwise cover more mailboxes than the MVP needs, production deployments should restrict the app to the relevant winery mailbox or mailbox group with Exchange application RBAC / application access controls.

## Environment Variables

```env
OUTLOOK_GRAPH_TENANT_ID=
OUTLOOK_GRAPH_CLIENT_ID=
OUTLOOK_GRAPH_CLIENT_SECRET=
OUTLOOK_GRAPH_BASE_URL=https://graph.microsoft.com/v1.0
OUTLOOK_GRAPH_TOKEN_BASE_URL=https://login.microsoftonline.com

EMAIL_SYNC_ENABLED=false
EMAIL_SYNC_INTERVAL_MS=300000
EMAIL_SYNC_MAX_MESSAGES=25
EMAIL_SYNC_INITIAL_LOOKBACK_HOURS=24
```

`EMAIL_SYNC_ENABLED=false` keeps background polling off by default. Managers can still run a manual inbox sync from the integrations screen.

## Winery Configuration

In the winery integrations UI:

1. Set Email provider to `Outlook / Microsoft 365`.
2. Set Email From Address to the sender address used for outbound replies.
3. Set the Email connection Account ID to the mailbox user principal name, for example `cellardoor@examplewinery.com`.
4. Optionally set Location ID to a Microsoft Graph mail folder ID. If blank, the sync uses `inbox`.
5. Save connections.
6. Use Test to confirm the server credentials and mailbox address are present.
7. Use Sync Inbox to import recent messages.

The server accepts manual syncs through:

```http
POST /api/winery/integration-config/email/sync
Content-Type: application/json

{ "limit": 25 }
```

Only winery managers and admins can call this endpoint.

## Inbound Sync Flow

1. `emailSync.service` loads the winery's `WineryIntegrationConfig`.
2. It only proceeds when `emailProvider` is `outlook`.
3. It resolves the mailbox from `providerConnections.email.externalAccountId`, falling back to `emailFromAddress`.
4. It finds or creates an `EmailSyncState` row for the winery, provider, mailbox, and folder.
5. It fetches messages from Microsoft Graph using the previous `lastMessageReceivedAt`, or an initial lookback window.
6. Each message is normalized by the Outlook provider.
7. Existing messages with the same provider external ID are skipped.
8. New messages are stored as inbound `Messages`.
9. Customer identity matching runs without auto-creating a member.
10. The existing triage service classifies the email.
11. `taskService.createTask` creates the task and links it to the message.

The sync summary returns:

- `fetched`
- `imported`
- `duplicates`
- `createdTasks`
- `lastMessageReceivedAt`

## Outbound Send Flow

When a task is actioned and has a suggested reply:

1. `execution.service` resolves the destination from `suggestedRecipientEmail`, the linked member, or manual intake details.
2. It passes `suggestedReplySubject`, `suggestedReplyBody`, and `suggestedCc` to `notification.service`.
3. `notification.service` loads the winery integration config.
4. If `emailProvider` is `outlook`, it sends through Microsoft Graph `sendMail`.
5. Otherwise it falls back to the SendGrid provider.
6. The outbound message attempt is logged in `Messages`.

This means the manager/staff review popup can be manually corrected before actioning a task, including recipient, subject, body, and CC fields.

## Changing Providers Later

Email providers live behind `src/services/integrations/email/email.adapter.js`.

A new provider should implement:

- `isAuthenticated()`
- `listInboxMessages({ since, limit, folderId })`
- `sendEmail({ to, from, subject, text, cc })`

Then register it in `src/services/integrations/email/index.js` and expose the provider option in `frontend/components/winery/IntegrationsTab.tsx`.

Provider-specific credentials should not be added as plain JSON fields in `providerConnections` for production. The next production step is a credential store with encryption and rotation, or provider OAuth where each winery grants scoped mailbox access.

## Operational Notes

- Run the database migration that creates `EmailSyncStates` before enabling sync.
- Start with manual syncs for validation before enabling `EMAIL_SYNC_ENABLED=true`.
- Keep `EMAIL_SYNC_MAX_MESSAGES` low during rollout to avoid importing a large historic backlog.
- Use a dedicated mailbox or restricted mailbox scope for the Microsoft app registration.
- Monitor `EmailSyncState.lastError` and `syncStats` for each winery.
