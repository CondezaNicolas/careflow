import assert from "node:assert/strict";
import test from "node:test";

import { AUTH_STATE_EVENT } from "@/features/auth/auth.types";
import { createJwt, installMockLocalStorage } from "@/test/test-helpers";

installMockLocalStorage();

let fetchCalls: Array<{ input: string; init?: RequestInit }> = [];
let shouldRejectLogin = false;
let shouldRejectRefresh = false;

function mockResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json"
    }
  });
}

test.beforeEach(async () => {
  fetchCalls = [];
  shouldRejectLogin = false;
  shouldRejectRefresh = false;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl = input.toString();
    fetchCalls.push({ input: requestUrl, init });

    if (requestUrl.endsWith("/auth/login")) {
      if (shouldRejectLogin) {
        return mockResponse({ message: "Invalid credentials" }, 401);
      }

      return mockResponse({
        accessToken: createJwt({ role: "admin", sub: "admin-5" }),
        refreshToken: "refresh-login",
        expiresIn: 900
      });
    }

    if (requestUrl.endsWith("/auth/refresh")) {
      if (shouldRejectRefresh) {
        return mockResponse({ message: "Refresh expired" }, 401);
      }

      return mockResponse({
        accessToken: createJwt({
          role: "admin",
          sub: "admin-5",
          exp: Math.floor(Date.now() / 1000) + 1800
        }),
        refreshToken: "refresh-rotated",
        expiresIn: 1800
      });
    }

    if (requestUrl.endsWith("/auth/logout")) {
      return mockResponse({ success: true });
    }

    return mockResponse({ message: "Not found" }, 404);
  }) as typeof fetch;

  const { useAuthStore } = await import("./auth-store");
  useAuthStore.persist.clearStorage();
  useAuthStore.setState({
    isHydrated: true,
    session: null,
    status: "anonymous",
    lastEvent: null
  });
});

test("login and refresh actions normalize and rotate the session", async () => {
  const { useAuthStore } = await import("./auth-store");

  const loginSession = await useAuthStore.getState().login({
    email: "ADMIN@example.com",
    password: "password123"
  });

  assert.equal(loginSession.principal.role, "admin");
  assert.equal(useAuthStore.getState().status, "authenticated");
  assert.equal(useAuthStore.getState().lastEvent, null);

  const refreshedSession = await useAuthStore.getState().refresh();

  assert.equal(refreshedSession?.refreshToken, "refresh-rotated");
  assert.equal(fetchCalls[1]?.input.endsWith("/auth/refresh"), true);
});

test("logout clears the current session even after a successful API call", async () => {
  const { useAuthStore } = await import("./auth-store");

  await useAuthStore.getState().login({
    email: "admin@example.com",
    password: "password123"
  });

  await useAuthStore.getState().logout();

  assert.equal(useAuthStore.getState().session, null);
  assert.equal(useAuthStore.getState().status, "anonymous");
  assert.equal(useAuthStore.getState().lastEvent, AUTH_STATE_EVENT.SIGNED_OUT);
  assert.equal(
    fetchCalls.some((call) => call.input.endsWith("/auth/logout")),
    true
  );
});

test("refresh failure clears the session and marks it as expired", async () => {
  const { useAuthStore } = await import("./auth-store");
  shouldRejectRefresh = true;

  await useAuthStore.getState().login({
    email: "admin@example.com",
    password: "password123"
  });

  const refreshedSession = await useAuthStore.getState().refresh();

  assert.equal(refreshedSession, null);
  assert.equal(useAuthStore.getState().session, null);
  assert.equal(useAuthStore.getState().lastEvent, AUTH_STATE_EVENT.SESSION_EXPIRED);
});

test("login failures surface an auth error for the UI", async () => {
  const { useAuthStore } = await import("./auth-store");
  shouldRejectLogin = true;

  await assert.rejects(
    useAuthStore.getState().login({
      email: "admin@example.com",
      password: "wrong-pass"
    })
  );

  assert.equal(useAuthStore.getState().authError, "Invalid credentials");
  assert.equal(useAuthStore.getState().activeRequest, null);
});

test("hydrate marks the store ready and restores persisted sessions", async () => {
  const { useAuthStore } = await import("./auth-store");

  globalThis.localStorage.setItem(
    "lia-clinic.auth-session",
    JSON.stringify({
      state: {
        session: {
          accessToken: createJwt({ role: "receptionist", sub: "desk-7", email: "desk@lia.test" }),
          accessTokenExpiresAt: Date.now() + 60_000,
          principal: {
            email: "desk@lia.test",
            id: "desk-7",
            role: "receptionist",
            tenantId: "tenant-1"
          },
          refreshToken: "refresh-desk"
        },
        status: "authenticated"
      },
      version: 0
    })
  );

  await useAuthStore.getState().hydrate();

  assert.equal(useAuthStore.getState().isHydrated, true);
  assert.equal(useAuthStore.getState().session?.principal.role, "receptionist");
  assert.equal(useAuthStore.getState().status, "authenticated");
});
