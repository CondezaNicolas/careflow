import assert from "node:assert/strict";
import test from "node:test";

import {
  createSingleFlightRunner,
  getLoginErrorMessage,
  submitCredentialLogin,
  submitDevRoleLogin
} from "./login-flow";
import { AuthApiError } from "@/features/auth/api/auth-client";
import { createJwt } from "@/test/test-helpers";

const ADMIN_SESSION = {
  accessToken: createJwt({ role: "admin", sub: "admin-1" }),
  refreshToken: "refresh-1",
  accessTokenExpiresAt: Date.now() + 900_000,
  principal: {
    id: "admin-1",
    tenantId: "tenant-1",
    role: "admin" as const,
    email: "admin@example.com"
  }
};

test("submitCredentialLogin redirects to the authenticated role landing route", async () => {
  const redirects: string[] = [];

  const redirectTo = await submitCredentialLogin(
    { email: "admin@example.com", password: "password123" },
    {
      login: async () => ADMIN_SESSION,
      navigate: (href) => {
        redirects.push(href);
      }
    }
  );

  assert.equal(redirectTo, "/admin");
  assert.deepEqual(redirects, ["/admin"]);
});

test("submitDevRoleLogin forwards the dev redirect hint and navigates to the resolved role route", async () => {
  const redirects: string[] = [];
  const devLoginCalls: Array<{ role?: string; redirect?: string }> = [];

  const redirectTo = await submitDevRoleLogin("receptionist", {
    devLogin: async (input) => {
      devLoginCalls.push(input ?? {});

      return {
        accessToken: createJwt({ role: "receptionist", sub: "reception-1" }),
        refreshToken: null,
        accessTokenExpiresAt: Date.now() + 900_000,
        principal: {
          id: "reception-1",
          tenantId: "tenant-1",
          role: "receptionist",
          email: "reception@example.com"
        }
      };
    },
    navigate: (href) => {
      redirects.push(href);
    }
  });

  assert.equal(redirectTo, "/receptionist");
  assert.deepEqual(devLoginCalls, [{ role: "receptionist", redirect: "/receptionist" }]);
  assert.deepEqual(redirects, ["/receptionist"]);
});

test("createSingleFlightRunner drops overlapping submissions", async () => {
  const run = createSingleFlightRunner();

  let resolveFirst!: () => void;
  let callCount = 0;

  const firstRun = run(async () => {
    callCount += 1;

    await new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });

    return "first";
  });

  const secondRun = run(async () => {
    callCount += 1;
    return "second";
  });

  assert.equal(await secondRun, null);

  resolveFirst();

  assert.equal(await firstRun, "first");
  assert.equal(callCount, 1);
});

test("getLoginErrorMessage preserves backend auth messages", () => {
  assert.equal(
    getLoginErrorMessage(new AuthApiError("Invalid credentials", 401)),
    "Invalid credentials"
  );
  assert.equal(getLoginErrorMessage(new Error("Network down")), "Network down");
});
