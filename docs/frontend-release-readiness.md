# Frontend Release Readiness Runbook

This runbook is the final frontend-only go-live gate for the `@lia/web` authentication and role-routing surface.

## 1) Environment Configuration

### Required Environment Variables

Copy `.env.example` into `.env.local` and provide production-safe values:

- `NEXT_PUBLIC_API_URL` - Backend API URL
- `NEXT_PUBLIC_APP_URL` - Frontend URL (e.g., https://lia.example.com)

### Local-only Verification Toggle

- `NEXT_PUBLIC_DEV_LOGIN_ENABLED=true` - Enables the guarded dev-login shortcut cards for local smoke checks only.

## 2) Verification Matrix

From the repo root, run:

```bash
# Type checking
npm run typecheck -w @lia/web

# Linting
npm run lint -w @lia/web

# Unit and integration tests
npm run test -w @lia/web

# Contract tests
npm run test:contracts -w @lia/web

# Playwright smoke suite (spawns its own Next.js dev server)
npm run test:e2e -w @lia/web
```

**Expected**: All commands pass with exit code 0 without running a production build.

### Playwright Harness Notes

- Config entrypoint: `apps/web/playwright.config.ts`
- Shared fixtures and mocked auth transport: `apps/web/tests/e2e/fixtures.ts`
- Auth suite and page object: `apps/web/tests/e2e/auth/auth.spec.ts`, `apps/web/tests/e2e/auth/auth-page.ts`
- The harness intercepts `/auth/login`, `/auth/refresh`, `/auth/logout`, and `/auth/dev-login`, so local E2E checks stay deterministic and do not depend on a live backend.

## 3) Manual Role Smoke Checklist

Run these checks in a local browser after the verification matrix passes:

| Role         | Entry                          | Expected landing route | Smoke assertions                                                                         |
| ------------ | ------------------------------ | ---------------------- | ---------------------------------------------------------------------------------------- |
| Admin        | Dev shortcut or seeded session | `/admin`               | Header shows `Admin command center`, logout returns to `/login?reason=signed-out`        |
| Clinician    | Dev shortcut or seeded session | `/clinician`           | Header shows `Clinician command center`, logout returns to `/login?reason=signed-out`    |
| Receptionist | Dev shortcut or seeded session | `/receptionist`        | Header shows `Receptionist command center`, logout returns to `/login?reason=signed-out` |
| Patient      | Dev shortcut or seeded session | `/patient`             | Header shows `Patient command center`, logout returns to `/login?reason=signed-out`      |

Manual spot checks to record during handoff:

1. Invalid credentials stay on `/login` and render visible feedback.
2. Opening `/admin` while signed out redirects to `/login?reason=login-required`.
3. Refreshing the browser with a valid local session reopens the matching role workspace.

## 4) Health Endpoints

The frontend relies on these backend health checks (see backend runbook):

- `GET /health/live` - Process liveness
- `GET /health/ready` - Readiness with dependencies

## 5) Smoke Checks (Post-Deploy)

### Critical User Flows

After deployment, verify these 3-5 critical flows:

1. **Authentication**
   - User can sign in with clinic credentials
   - Session persists across page refreshes
   - User can sign out and land on `/login?reason=signed-out`
   - Dev-login shortcuts remain disabled outside local verification

2. **Navigation**
   - Root route redirects anonymous users to `/login`
   - Protected routes redirect anonymous users to `/login?reason=login-required`
   - Each role lands only in its own protected route shell

3. **Data Display**
   - Role landing headline matches the authenticated role
   - Session banner shows the authenticated email and tenant
   - Logout control remains responsive while the request is in flight

### Browser Compatibility

Verify in:

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

### Accessibility

Run accessibility checks:

```bash
# Requires production server running
npm run test:a11y
```

Expected: Zero critical/serious violations.

## 6) Rollback Plan

If release fails smoke gates:

1. **Immediate**: Stop rollout traffic to current deployment
2. **Revert**: Deploy previous stable version/tag
3. **Verify**: Re-run smoke checks on reverted version
4. **Document**: Open incident note with:
   - Failing check
   - First failing timestamp
   - Mitigation taken
   - Owner for remediation

## 7) CI/CD Integration

### GitHub Actions (if using)

The project should have workflows for:

- `e2e.yml` - Runs Playwright E2E tests on PRs
- `contracts.yml` - Runs API contract tests
- Existing workflow should include accessibility step

### Pre-Deployment Checklist

- [ ] All tests pass locally
- [ ] Environment variables configured
- [ ] TypeScript strict mode passes
- [ ] Playwright auth smoke suite passes in Chromium
- [ ] Dev-login shortcuts disabled in non-local environments
- [ ] No accessibility violations

### Post-Deployment Checklist

- [ ] Home page redirects into login or the active role workspace
- [ ] Login flow works
- [ ] Admin, clinician, receptionist, and patient shells route correctly
- [ ] No critical errors in console
- [ ] Performance acceptable (Core Web Vitals)

## 8) Monitoring

### Frontend Error Tracking

Monitor for:

- JavaScript runtime errors
- API request failures
- Failed component renders

### Performance Metrics

Track:

- First Contentful Paint (FCP)
- Largest Contentful Paint (LCP)
- Time to Interactive (TTI)
- Cumulative Layout Shift (CLS)

## 9) Dependencies

### Update Strategy

Before each release:

1. Check for security advisories: `npm audit`
2. Update minor/patch versions
3. Review breaking changes for major versions
4. Test thoroughly after dependency updates

### Trusted Dependencies

- `next` - Framework
- `react` - UI library
- `@playwright/test` - E2E testing
- `axe-core` - Accessibility
- `supertest` - Contract testing
