import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildAuthRouteRateLimitPolicies,
  createRateLimitMessage,
  isAuthRateLimitedPath
} from "./rate-limit-policy.js";

describe("rate limit policy", () => {
  const config = {
    windowMs: 900_000,
    maxRequests: 100,
    auth: {
      loginMaxRequests: 5,
      refreshMaxRequests: 20,
      logoutMaxRequests: 20,
      devLoginMaxRequests: 3
    }
  };

  it("builds explicit policies for auth-sensitive routes", () => {
    const policies = buildAuthRouteRateLimitPolicies(config);

    assert.deepEqual(
      policies.map((policy) => ({ path: policy.path, maxRequests: policy.maxRequests })),
      [
        { path: "/auth/login", maxRequests: 5 },
        { path: "/auth/refresh", maxRequests: 20 },
        { path: "/auth/logout", maxRequests: 20 },
        { path: "/auth/dev-login", maxRequests: 3 }
      ]
    );
  });

  it("matches auth routes even when express normalizes a trailing slash", () => {
    assert.equal(isAuthRateLimitedPath("/auth/login"), true);
    assert.equal(isAuthRateLimitedPath("/auth/login/"), true);
    assert.equal(isAuthRateLimitedPath("/patients/123/chart"), false);
  });

  it("returns route-specific throttle messages", () => {
    assert.equal(createRateLimitMessage("dev-login"), "Too many requests for auth.dev-login");
  });
});
