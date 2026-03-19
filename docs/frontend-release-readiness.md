# Frontend Release Readiness Runbook

This runbook is the final frontend-only go-live gate for `lia-clinic-core` web application.

## 1) Environment Configuration

### Required Environment Variables

Copy `.env.example` into `.env.local` and provide production-safe values:

- `NEXT_PUBLIC_API_URL` - Backend API URL
- `NEXT_PUBLIC_APP_URL` - Frontend URL (e.g., https://lia.example.com)

### Optional (for advanced features)

- `NEXT_PUBLIC_ANALYTICS_ID` - Analytics tracking ID
- `NEXT_PUBLIC_FEATURE_FLAGS` - Comma-separated feature flags

## 2) Build Quality Gates

From `apps/web` directory, run:

```bash
# Type checking
npm run typecheck

# Linting
npm run lint

# Unit and integration tests
npm run test

# Contract tests
npm run test:contracts

# E2E tests (requires dev server running)
npm run test:e2e
```

**Expected**: All commands pass with exit code 0.

## 3) Production Build

```bash
npm run build
```

### Build Output Verification

The build should produce:
- Static pages optimized
- API routes compiled
- Client bundles chunked
- Images optimized (if using next/image)
- Fonts optimized (if using next/font)

## 4) Health Endpoints

The frontend relies on these backend health checks (see backend runbook):

- `GET /health/live` - Process liveness
- `GET /health/ready` - Readiness with dependencies

## 5) Smoke Checks (Post-Deploy)

### Critical User Flows

After deployment, verify these 3-5 critical flows:

1. **Authentication**
   - User can sign in via OIDC
   - Session persists across page refreshes
   - User can sign out

2. **Navigation**
   - All main navigation links work
   - Protected routes redirect appropriately
   - No 404 errors on main pages

3. **Data Display**
   - Patient list loads
   - Scheduling view shows appointments
   - Clinical notes accessible

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
- [ ] No console errors in production build
- [ ] Environment variables configured
- [ ] Build completes without warnings
- [ ] TypeScript strict mode passes
- [ ] No accessibility violations

### Post-Deployment Checklist

- [ ] Home page loads
- [ ] Login flow works
- [ ] Main navigation works
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
