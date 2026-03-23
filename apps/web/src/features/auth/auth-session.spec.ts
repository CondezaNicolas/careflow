import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSessionFromDevLoginResponse,
  buildSessionFromTokenResponse,
  decodeJwtClaims,
  getActiveSession,
  isSessionExpired
} from "./auth-session";
import { createJwt } from "@/test/test-helpers";

test("decodeJwtClaims returns backend-aligned claims", () => {
  const token = createJwt({ role: "clinician", tenantId: "tenant-9" });

  const claims = decodeJwtClaims(token);

  assert.equal(claims.role, "clinician");
  assert.equal(claims.tenantId, "tenant-9");
});

test("buildSessionFromTokenResponse retains tokens and normalized principal", () => {
  const accessToken = createJwt({ sub: "admin-1", email: "admin@example.com", role: "admin" });

  const session = buildSessionFromTokenResponse({
    accessToken,
    refreshToken: "refresh-1",
    expiresIn: 900
  });

  assert.equal(session.refreshToken, "refresh-1");
  assert.equal(session.principal.id, "admin-1");
  assert.equal(session.principal.email, "admin@example.com");
  assert.equal(session.principal.role, "admin");
});

test("buildSessionFromDevLoginResponse creates a session without refresh token", () => {
  const session = buildSessionFromDevLoginResponse({
    success: true,
    role: "patient",
    accessToken: createJwt({ role: "patient" }),
    redirectUrl: "/patient"
  });

  assert.equal(session.refreshToken, null);
  assert.equal(session.principal.role, "patient");
});

test("getActiveSession drops expired persisted sessions", () => {
  const session = buildSessionFromTokenResponse({
    accessToken: createJwt({ exp: Math.floor(Date.now() / 1000) - 30 }),
    refreshToken: "refresh-expired",
    expiresIn: 900
  });

  assert.equal(isSessionExpired(session), true);
  assert.equal(getActiveSession(session), null);
});
