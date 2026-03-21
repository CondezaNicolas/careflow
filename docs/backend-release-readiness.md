# Backend Release Readiness Runbook

This runbook is the final backend-only go-live gate for `lia-clinic-core`.

## 1) Environment sanity

- Copy `.env.example` into `.env.local` for local work, or into your deployment secret store for real environments.
- Required backend keys:
  - `DATABASE_URL`
  - `REDIS_URL`
  - `WORKER_POLL_INTERVAL_MS`
  - `WORKER_SHUTDOWN_GRACE_PERIOD_MS`
  - `GOOGLE_CALENDAR_PROVIDER_MODE`
  - `EMAIL_PROVIDER_MODE`
  - `WHATSAPP_PROVIDER_MODE`
  - `JWT_SECRET`
  - `JWT_REFRESH_SECRET`
  - `SESSION_COOKIE_NAME`
  - `SESSION_SECRET`
  - `GOOGLE_CALENDAR_CLIENT_ID`
  - `GOOGLE_CALENDAR_CLIENT_SECRET`
  - `GOOGLE_CALENDAR_REFRESH_TOKEN`
  - `GOOGLE_CALENDAR_CALENDAR_ID`
  - `EMAIL_PROVIDER_API_KEY`
  - `EMAIL_PROVIDER_FROM`
  - `WHATSAPP_ACCESS_TOKEN`
  - `WHATSAPP_PHONE_NUMBER_ID`
  - `WHATSAPP_BUSINESS_ACCOUNT_ID`
  - `GOOGLE_CALENDAR_MAX_RETRIES`
  - `GOOGLE_CALENDAR_BACKOFF_SECONDS`
  - `NOTIFICATIONS_MAX_RETRIES`
  - `NOTIFICATIONS_BACKOFF_SECONDS`
- For non-test environments, use:
  - `DATABASE_URL` with `postgresql://`
  - strong random values for `JWT_SECRET`, `JWT_REFRESH_SECRET`, and `SESSION_SECRET`
  - `GOOGLE_CALENDAR_PROVIDER_MODE=provider`, `EMAIL_PROVIDER_MODE=provider`, and `WHATSAPP_PROVIDER_MODE=provider` for deployed workers
  - `AUTH_DEV_BYPASS=false` and `DEV_LOGIN_ENABLED=false`

Provider integration note:

- `GET /ops/diagnostics` now returns the resolved runtime mode plus `preflight` integration readiness for `google_calendar`, `email`, and `whatsapp`.
- `GET /ops/diagnostics` also surfaces request logging, request timeout, and graceful shutdown settings so operators can verify runtime hardening without shell access.
- In `production`, `google_calendar`, `email`, and `whatsapp` are blocking readiness checks.
- In `development` and `test`, provider checks are visible but non-blocking.

## 2) Migration and deploy sanity

From repository root, run:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lia_clinic npm run migration:check
```

Expected result: migration check passes and confirms baseline order is intact.

## 3) Backend quality gate (explicit DB URL)

Run the backend-only release gate with explicit infrastructure URLs:

```bash
npm run contract:sync
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lia_clinic REDIS_URL=redis://localhost:6379 npm run verify:backend
```

`verify:backend` runs API typecheck/tests/migration+contract checks and worker typecheck/tests without touching `apps/web`.
`contract:sync` refreshes the generated backend route snapshot at `apps/api/openapi/runtime-routes.json` so `contract:lint` can fail fast on runtime/OpenAPI/Postman drift.

## 4) Operational endpoints

Health endpoints (no auth):

- `GET /health/live`: process liveness probe.
- `GET /health/ready`: readiness probe with DB check; returns `503` when not ready.

Admin endpoints (require admin session):

- `GET /ops/outbox/health`: outbox backlog, retry, and dead-letter visibility.
- `GET /ops/metrics`: request metrics snapshot.
- `GET /ops/diagnostics`: release diagnostics snapshot (env summary, migration inventory, readiness status).

## 5) Production bring-up order (providers first)

1. Provision production JWT and session secrets in your secret manager.
2. Provision Google Calendar service account/user grant and confirm access to the configured calendar ID.
3. Provision Email provider sender identity and API key with send permission.
4. Provision WhatsApp business account, phone number id, and access token.
5. Deploy API and worker; the worker image now starts in long-lived service mode with `npm run start -w @lia/worker` rather than watch mode.
6. Verify worker env wiring before traffic:
   - `WORKER_POLL_INTERVAL_MS` matches the expected cadence for your environment.
   - `WORKER_SHUTDOWN_GRACE_PERIOD_MS` is long enough for one in-flight cycle to finish cleanly.
   - provider mode flags are all `provider` and all matching credentials are present.
7. Verify `GET /health/live` = `200` and `GET /health/ready` = `200`.
8. Verify `GET /ops/diagnostics` as admin returns:
   - `readiness.status = "ready"`
   - `preflight.status = "ready"`
   - provider entries are `configured` with empty `missingEnvKeys`.
9. Verify worker logs show:
   - one `worker.runtime.started` entry after boot,
   - repeating `worker.cycle.completed` entries,
   - no unexpected `worker.cycle.requires_attention` entries.

Shutdown semantics note:

- `SIGINT` and `SIGTERM` stop new polling cycles, allow the current cycle to reach a safe finish, close the PostgreSQL pool, and emit `worker.runtime.stopped`.

## 6) Smoke checks (post-deploy)

- Auth:
  - Complete one login + refresh flow and confirm the session cookie is issued and cleared on logout.
- Scheduling/Calendar:
  - Create or reschedule one appointment and confirm a corresponding outbox event is processed by worker.
- Notifications:
  - Trigger one appointment lifecycle notification and one exam status notification; confirm delivery records are created.
- Ops visibility:
  - Check `/ops/outbox/health` and verify no growing retry/dead-letter backlog.
  - Check worker logs for repeated `worker.cycle.completed` entries and absence of `worker.cycle.requires_attention` during the smoke window.

## 7) Rollback plan

If release fails readiness/smoke gates:

1. Stop rollout traffic to current deployment.
2. Revert to previous stable application image/tag for API and worker.
3. Keep database schema at current version unless a migration rollback script exists and is tested.
4. Re-run readiness and smoke checks on the reverted version.
5. Open incident note with:
   - failing check (`/health/ready` or `preflight` integration),
   - first failing timestamp,
   - mitigation taken,
   - owner for provider/account remediation.

## 8) External operational prerequisites

The following are required to pass production preflight but are external to this repository:

- Production JWT/session secret provisioning and rotation.
- Google Calendar OAuth/client and refresh-token provisioning.
- Email provider account/domain verification and API credentials.
- WhatsApp business account setup and messaging credentials.
