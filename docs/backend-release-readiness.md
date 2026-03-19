# Backend Release Readiness Runbook

This runbook is the final backend-only go-live gate for `lia-clinic-core`.

## 1) Environment sanity

- Copy `.env.example` into `.env` and provide production-safe values.
- Required backend keys:
  - `DATABASE_URL`
  - `OIDC_ISSUER`
  - `OIDC_CLIENT_ID`
  - `OIDC_CLIENT_SECRET`
  - `OIDC_REDIRECT_URI`
  - `SESSION_COOKIE_NAME`
  - `SESSION_TTL_MINUTES`
  - `GOOGLE_CALENDAR_CLIENT_ID`
  - `GOOGLE_CALENDAR_CLIENT_SECRET`
  - `GOOGLE_CALENDAR_REFRESH_TOKEN`
  - `GOOGLE_CALENDAR_CALENDAR_ID`
  - `EMAIL_PROVIDER_API_KEY`
  - `EMAIL_PROVIDER_FROM`
  - `WHATSAPP_ACCESS_TOKEN`
  - `WHATSAPP_PHONE_NUMBER_ID`
  - `WHATSAPP_BUSINESS_ACCOUNT_ID`
- For non-test environments, use:
  - `DATABASE_URL` with `postgresql://`
  - `OIDC_ISSUER` and `OIDC_REDIRECT_URI` with `https://`

Provider integration note:

- `GET /ops/diagnostics` now returns `preflight` integration readiness for `oidc`, `google_calendar`, `email`, and `whatsapp`.
- In `production`, `google_calendar`, `email`, and `whatsapp` are blocking readiness checks.
- In `development` and `test`, provider checks are visible but non-blocking.

## 2) Migration and deploy sanity

From repository root, run:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lia_clinic npm run migration:check
```

Expected result: migration check passes and confirms baseline order is intact.

## 3) Backend quality gate (explicit DB URL)

Run all release gate commands with explicit database URL:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lia_clinic npm run typecheck
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lia_clinic npm run lint
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lia_clinic npm run test
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lia_clinic npm run migration:check
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lia_clinic npm run contract:lint
```

## 4) Operational endpoints

Health endpoints (no auth):

- `GET /health/live`: process liveness probe.
- `GET /health/ready`: readiness probe with DB check; returns `503` when not ready.

Admin endpoints (require admin session):

- `GET /ops/outbox/health`: outbox backlog, retry, and dead-letter visibility.
- `GET /ops/metrics`: request metrics snapshot.
- `GET /ops/diagnostics`: release diagnostics snapshot (env summary, migration inventory, readiness status).

## 5) Production bring-up order (providers first)

1. Provision and validate OIDC app callback (`/auth/callback`) and tenant/role claims.
2. Provision Google Calendar service account/user grant and confirm access to the configured calendar ID.
3. Provision Email provider sender identity and API key with send permission.
4. Provision WhatsApp business account, phone number id, and access token.
5. Deploy API and worker.
6. Verify `GET /health/live` = `200` and `GET /health/ready` = `200`.
7. Verify `GET /ops/diagnostics` as admin returns:
   - `readiness.status = "ready"`
   - `preflight.status = "ready"`
   - provider entries are `configured` with empty `missingEnvKeys`.

## 6) Smoke checks (post-deploy)

- Auth:
  - Complete one OIDC callback flow and confirm session cookie issuance.
- Scheduling/Calendar:
  - Create or reschedule one appointment and confirm a corresponding outbox event is processed by worker.
- Notifications:
  - Trigger one appointment lifecycle notification and one exam status notification; confirm delivery records are created.
- Ops visibility:
  - Check `/ops/outbox/health` and verify no growing retry/dead-letter backlog.

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

- OIDC tenant/app provisioning and redirect URI registration.
- Google Calendar OAuth/client and refresh-token provisioning.
- Email provider account/domain verification and API credentials.
- WhatsApp business account setup and messaging credentials.
