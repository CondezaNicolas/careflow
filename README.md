# LIA Clinic Core

Monorepo scaffold for the clinical core MVP using:

- `apps/api`: NestJS modular monolith
- `apps/web`: Next.js 15 web app
- `apps/worker`: outbox/queue worker bootstrap
- `packages/shared-types`: shared auth and role contracts

## Local setup

1. Copy `.env.example` to `.env` and update secrets.
   - `DATABASE_URL` defaults to `postgresql://lia:lia@localhost:5432/lia_clinic` when omitted.
2. Start infra services:

```bash
docker compose up -d
```

3. Install dependencies and run all apps:

```bash
npm install
npm run dev:all
```

## Verification

```bash
npm run typecheck
npm run lint
npm run test
npm run migration:check
npm run contract:lint
```

## Backend release readiness

- Release checklist and runbook: `docs/backend-release-readiness.md`
- Health probes:
  - `GET /health/live`
  - `GET /health/ready`
- Admin diagnostics:
  - `GET /ops/outbox/health`
  - `GET /ops/metrics`
  - `GET /ops/diagnostics`
- `GET /ops/diagnostics` includes integration preflight readiness (`oidc`, `google_calendar`, `email`, `whatsapp`).

Run the backend verification gate with explicit database URL:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lia_clinic npm run typecheck
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lia_clinic npm run lint
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lia_clinic npm run test
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lia_clinic npm run migration:check
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lia_clinic npm run contract:lint
```
