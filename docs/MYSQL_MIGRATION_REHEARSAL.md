# MySQL migration rehearsal

## 11 July 2026 result

The complete migration chain was exercised against disposable local MySQL 8 databases. Scratch databases and temporary dumps were removed after verification.

### Passed

- A fresh database migrates through `20260716010000-repair-winery-knowledge-schema.js` with zero pending migrations.
- The fresh database accepts the Sidewood database-only seed twice, proving the intended idempotent rehearsal path without changing Firebase.
- `db:migrate:undo:all` rolls the complete schema back to zero applied migrations.
- The fully rolled-back database remigrates to the current schema with zero pending migrations.
- A transactional dump of the existing development database imports into an isolated clone and accepts all 12 previously pending migrations.
- Critical clone row counts remain unchanged: 22 wineries, 19 users, 45 members, 20 tasks, and 12 notices.
- The Sidewood smoke passes on the migrated clone for Owen, Serena, Jacob, and Joanna, including area visibility, scoped management, secret serialization, and unsupported booking-provider fallback.
- The configured local development database was backed up, migrated, and rechecked. All migrations are now applied and the same critical row counts were preserved.

The rehearsal found and corrected fresh-schema gaps in Member profile fields and the winery SOP table. It also corrected rollback failures caused by foreign-key backing indexes, case-sensitive table checks, and the legacy `CalendarEvents` dependency on `Tasks`.

### Production procedure

1. Take and verify a restorable database backup.
2. Record `npm run db:migrate:status` and critical row counts.
3. Restore a recent production backup into an isolated database and run `npm run db:migrate` there first.
4. Run the application smoke tests against that migrated copy.
5. Put production writes into the deployment's normal maintenance/drain procedure.
6. Run `npm run db:migrate` against production before starting the new application instances.
7. Recheck migration status, row counts, health, login, and permission paths.

`db:migrate:undo:all` is now mechanically green, but production rollback should still prefer restoring the verified pre-deployment backup. A complete schema rollback is destructive and is not a substitute for a data-preserving release rollback.
