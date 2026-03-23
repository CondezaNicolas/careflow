import assert from "node:assert/strict";
import test from "node:test";

import {
  AUTH_STATE_EVENT,
  USER_ROLE,
  type PersistedAuthSession,
  type UserRole
} from "@/features/auth/auth.types";

import { buildLoginRoute, LOGIN_REDIRECT_REASON, resolveProtectedRoute } from "./protected-route";

function createSession(role: UserRole = USER_ROLE.ADMIN): PersistedAuthSession {
  return {
    accessToken: "token-1",
    refreshToken: "refresh-1",
    accessTokenExpiresAt: Date.now() + 60_000,
    principal: {
      id: "user-1",
      email: "user@example.com",
      role,
      tenantId: "tenant-1"
    }
  };
}

test("protected routes send anonymous users to login with the expired-session reason", () => {
  const resolution = resolveProtectedRoute({
    authEvent: AUTH_STATE_EVENT.SESSION_EXPIRED,
    isReady: true,
    pathname: "/admin",
    session: null
  });

  assert.deepEqual(resolution, {
    kind: "redirect-login",
    href: buildLoginRoute(LOGIN_REDIRECT_REASON.SESSION_EXPIRED),
    message: "Your session expired, so we brought you back to sign in again."
  });
});

test("protected routes bounce authenticated users back to their own landing page", () => {
  const resolution = resolveProtectedRoute({
    authEvent: null,
    isReady: true,
    pathname: "/patient",
    session: createSession(USER_ROLE.CLINICIAN)
  });

  assert.deepEqual(resolution, {
    kind: "redirect-role",
    href: "/clinician",
    message: "That route belongs to another role, so we are sending you to your workspace."
  });
});

test("protected routes allow the matching role to continue", () => {
  const resolution = resolveProtectedRoute({
    authEvent: null,
    isReady: true,
    pathname: "/receptionist",
    session: createSession(USER_ROLE.RECEPTIONIST)
  });

  assert.deepEqual(resolution, { kind: "allow" });
});
