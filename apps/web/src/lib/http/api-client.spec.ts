import assert from "node:assert/strict";
import test from "node:test";

import { createJwt, installMockLocalStorage } from "@/test/test-helpers";

installMockLocalStorage();

function mockJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json"
    }
  });
}

test("api client retries once after a single refresh for concurrent 401 responses", async () => {
  const fetchCalls: string[] = [];
  let protectedCallCount = 0;
  let refreshCount = 0;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl = input.toString();
    fetchCalls.push(requestUrl);

    if (requestUrl.endsWith("/auth/refresh")) {
      refreshCount += 1;
      return mockJsonResponse({
        accessToken: createJwt({ sub: "admin-1", exp: Math.floor(Date.now() / 1000) + 1800 }),
        refreshToken: "refresh-next",
        expiresIn: 1800
      });
    }

    if (requestUrl.endsWith("/protected")) {
      protectedCallCount += 1;

      const authorization = new Headers(init?.headers).get("Authorization");

      if (authorization?.includes("refresh-next")) {
        return mockJsonResponse({ ok: true });
      }

      if (authorization?.includes("access-initial")) {
        return mockJsonResponse({ message: "expired" }, 401);
      }

      if (authorization?.includes("admin-1")) {
        return mockJsonResponse({ ok: true });
      }
    }

    return mockJsonResponse({ ok: true });
  }) as typeof fetch;

  const { useAuthStore } = await import("@/features/auth/store/auth-store");
  const { createApiClient } = await import("./api-client");

  useAuthStore.persist.clearStorage();
  useAuthStore.setState({
    isHydrated: true,
    status: "authenticated",
    session: {
      accessToken: "access-initial",
      refreshToken: "refresh-initial",
      accessTokenExpiresAt: Date.now() + 1000,
      principal: {
        id: "admin-1",
        email: "admin@example.com",
        role: "admin",
        tenantId: "tenant-1"
      }
    }
  });

  const client = createApiClient();

  const [firstResponse, secondResponse] = await Promise.all([
    client.request("/protected"),
    client.request("/protected")
  ]);

  assert.equal(firstResponse.ok, true);
  assert.equal(secondResponse.ok, true);
  assert.equal(refreshCount, 1);
  assert.equal(protectedCallCount, 4);
});
