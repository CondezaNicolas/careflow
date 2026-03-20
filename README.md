# CareFlow

**CareFlow** — Unified clinic management system for human and veterinary practices.

## Overview

CareFlow is a modern, multi-tenant clinic management platform built with:

- **CareFlow API** (NestJS) — Core business logic, scheduling, clinical records, patient management
- **CareFlow Worker** — Background job processing (notifications, calendar sync, outbox patterns)
- **CareFlow Frontend** — Coming soon (Next.js 15)

## Project Structure

```
careflow/
├── apps/
│   ├── api/              # NestJS modular monolith
│   ├── worker/           # Background job worker
│   └── web/              # Next.js frontend (coming soon)
├── packages/
│   └── shared-types/     # Shared TypeScript types and contracts
├── docs/                 # Release readiness and roadmap docs
└── scripts/              # Dev and deployment scripts
```

## Features

- **Multi-tenant architecture** — Isolated data per clinic/organization
- **Scheduling** — Appointments with conflict detection and calendar sync
- **Clinical Records** — Patient history, exams, documents
- **Role-Based Access** — Admin, Doctor, Vet, Staff roles with permissions
- **Notifications** — Email, WhatsApp via outbox pattern
- **Google Calendar Integration** — Two-way sync for appointments
- **OIDC Authentication** — SSO ready with Keycloak, Auth0, Okta

## Tech Stack

| Layer          | Technology                     |
| -------------- | ------------------------------ |
| API            | NestJS, TypeScript, PostgreSQL |
| Cache/Queue    | Redis                          |
| Object Storage | MinIO (S3-compatible)          |
| Auth           | OIDC (Keycloak, Auth0, Okta)   |
| Worker         | Node.js, BullMQ                |
| Frontend       | Next.js 15 (coming soon)       |

## Local Development

### Prerequisites

- Node.js 20+
- Docker & Docker Compose
- npm 10+

### Setup

1. **Clone and install**

```bash
git clone https://github.com/CondezaNicolas/careflow.git
cd careflow
npm install
```

2. **Configure environment**

```bash
cp .env.example .env
# Edit .env with your secrets
```

3. **Start infrastructure**

```bash
docker compose up -d
```

4. **Run services**

```bash
# API and Worker
npm run dev:all

# API only
npm run dev
```

### Verification

```bash
npm run contract:sync
npm run typecheck
npm run lint
npm run test
npm run migration:check
npm run contract:lint
```

`npm run contract:sync` refreshes the generated backend route snapshot at `apps/api/openapi/runtime-routes.json` and normalizes the published JSON artifacts before `npm run contract:lint` checks runtime/OpenAPI/Postman drift.

### Environment Variables

Key variables to configure:

| Variable                  | Description           | Default                                          |
| ------------------------- | --------------------- | ------------------------------------------------ |
| `DATABASE_URL`            | PostgreSQL connection | `postgresql://lia:lia@localhost:5432/lia_clinic` |
| `REDIS_URL`               | Redis connection      | `redis://localhost:6379`                         |
| `OBJECT_STORAGE_ENDPOINT` | MinIO endpoint        | `http://localhost:9000`                          |
| `OIDC_ISSUER`             | OIDC provider URL     | Required                                         |
| `OIDC_CLIENT_ID`          | OIDC client ID        | Required                                         |
| `OIDC_CLIENT_SECRET`      | OIDC client secret    | Required                                         |

## Architecture

### Health Endpoints

- `GET /health/live` — Liveness probe
- `GET /health/ready` — Readiness probe
- `GET /ops/outbox/health` — Outbox pattern health
- `GET /ops/metrics` — Application metrics
- `GET /ops/diagnostics` — Integration preflight check

### Database Migrations

Migrations run automatically on startup. Manual check:

```bash
npm run migration:check
```

## Release Process

See `docs/backend-release-readiness.md` for the complete release checklist and runbook.

## Contributing

1. Create a feature branch from `develop`
2. Follow conventional commits format
3. Open a pull request to `develop`
4. Require 1 approval + passing CI
5. Squash and merge

## License

Private — All rights reserved.
