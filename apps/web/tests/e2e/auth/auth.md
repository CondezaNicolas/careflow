### E2E Tests: Authentication and Role Routing

**Suite ID:** `AUTH-E2E`
**Feature:** Login entry, protected route redirects, role routing, and logout handoff.

---

## Test Case: `AUTH-E2E-001` - Unauthenticated redirect

**Priority:** `critical`

**Tags:**

- type -> @e2e
- feature -> @auth

**Description/Objective:** Opening a protected route without a session must return the user to login with the proper reason.

### Expected Result:

- `/admin` redirects to `/login?reason=login-required`
- The login heading is visible after redirect

## Test Case: `AUTH-E2E-002` - Credential login role routing

**Priority:** `critical`

**Tags:**

- type -> @e2e
- feature -> @auth

**Description/Objective:** Successful credential login should route directly into the resolved role workspace.

### Expected Result:

- Mocked clinician login lands on `/clinician`
- The protected workspace header and logout control are visible

## Test Case: `AUTH-E2E-003` - Invalid credentials

**Priority:** `high`

**Tags:**

- type -> @e2e
- feature -> @auth

**Description/Objective:** Rejected credentials must keep the operator on login and show visible feedback.

### Expected Result:

- The browser stays on `/login`
- The alert shows `Invalid email or password.`

## Test Case: `AUTH-E2E-ROLE` - Role smoke matrix

**Priority:** `critical`

**Tags:**

- type -> @e2e
- feature -> @auth

**Description/Objective:** Each seeded authenticated role must land on its own workspace and return cleanly to login after logout.

### Expected Result:

- `admin`, `clinician`, `receptionist`, and `patient` each land on their matching route
- Logout returns to `/login?reason=signed-out`

## Test Case: `AUTH-E2E-004` - Persisted session restore

**Priority:** `high`

**Tags:**

- type -> @e2e
- feature -> @auth

**Description/Objective:** A persisted authenticated session should re-open the matching role workspace from `/` without another login.

### Expected Result:

- A seeded receptionist session redirects from `/` to `/receptionist`
- The protected header remains visible after hydration

## Test Case: `AUTH-E2E-005` - Dev-login shortcut path

**Priority:** `high`

**Tags:**

- type -> @e2e
- feature -> @auth

**Description/Objective:** A visible dev-login shortcut should authenticate through the browser flow and land on the selected role shell.

### Expected Result:

- Clicking the patient shortcut from `/login` lands on `/patient`
- The patient workspace heading and logout control are visible

## Test Case: `AUTH-E2E-006` - Duplicate submit guard

**Priority:** `high`

**Tags:**

- type -> @e2e
- feature -> @auth

**Description/Objective:** Repeated submits from the rendered login form should stay single-flight while the first request is still pending.

### Expected Result:

- The sign-in control becomes disabled and shows `Signing in...`
- Only one login request is observed before the role redirect completes

## Test Case: `AUTH-E2E-007` - Authenticated login bounce-away

**Priority:** `high`

**Tags:**

- type -> @e2e
- feature -> @auth

**Description/Objective:** An already authenticated operator should be redirected away from `/login` into the matching workspace.

### Expected Result:

- A seeded clinician session navigating to `/login` lands on `/clinician`
- The workspace heading remains visible instead of the login form
