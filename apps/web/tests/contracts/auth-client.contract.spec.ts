import assert from "node:assert/strict";
import test from "node:test";

import { createJwt } from "@/test/test-helpers";
import { createAuthClient } from "@/features/auth/api/auth-client";

test("auth client matches backend login, refresh, logout, and dev-login routes", async () => {
  const calls: Array<{ input: string; init?: RequestInit }> = [];

  const client = createAuthClient({
    apiUrl: "http://localhost:3311",
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const requestUrl = input.toString();
      calls.push({ input: requestUrl, init });

      if (requestUrl.endsWith("/auth/login") || requestUrl.endsWith("/auth/refresh")) {
        return new Response(
          JSON.stringify({
            accessToken: createJwt(),
            refreshToken: "refresh-token",
            expiresIn: 900
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json"
            }
          }
        );
      }

      if (requestUrl.endsWith("/auth/logout")) {
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: {
            "content-type": "application/json"
          }
        });
      }

      if (requestUrl.includes("/auth/dev-login")) {
        return new Response(
          JSON.stringify({
            success: true,
            role: "receptionist",
            redirectUrl: "/receptionist",
            accessToken: createJwt({ role: "receptionist" })
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json"
            }
          }
        );
      }

      return new Response(JSON.stringify({ message: "not found" }), {
        status: 404,
        headers: {
          "content-type": "application/json"
        }
      });
    }) as typeof fetch
  });

  await client.login({ email: "ADMIN@example.com", password: "password123" });
  await client.refresh("refresh-token");
  await client.logout({ refreshToken: "refresh-token" }, "access-token");
  await client.devLogin({ role: "receptionist", redirect: "/receptionist" });

  assert.equal(calls[0]?.input, "http://localhost:3311/auth/login");
  assert.equal(calls[1]?.input, "http://localhost:3311/auth/refresh");
  assert.equal(calls[2]?.input, "http://localhost:3311/auth/logout");
  assert.match(
    calls[3]?.input ?? "",
    /http:\/\/localhost:3311\/auth\/dev-login\?role=receptionist&redirect=%2Freceptionist/
  );

  const loginBody = JSON.parse((calls[0]?.init?.body as string | undefined) ?? "{}");
  assert.equal(loginBody.email, "admin@example.com");
  assert.equal(loginBody.password, "password123");

  const logoutHeaders = new Headers(calls[2]?.init?.headers);
  assert.equal(logoutHeaders.get("Authorization"), "Bearer access-token");
});
