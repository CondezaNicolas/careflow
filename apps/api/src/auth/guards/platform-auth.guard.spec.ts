import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Reflector } from "@nestjs/core";
import { USER_ROLE } from "../../common/constants/user-role.js";
import { ROLES_KEY } from "../decorators/roles.decorator.js";
import { AuthenticatedGuard } from "./authenticated.guard.js";
import { PlatformAuthGuard } from "./platform-auth.guard.js";
import { RolesGuard } from "./roles.guard.js";

describe("platform auth guards", () => {
  it("hydrates request.principal from the validated JWT payload", () => {
    const guard = new PlatformAuthGuard(new Reflector());
    const request: Record<string, unknown> = {};
    const context = createExecutionContext(request);

    const payload = {
      sub: "usr-1",
      tenantId: "00000000-0000-4000-8000-000000000001",
      role: USER_ROLE.ADMIN,
      email: "admin@lia.local"
    };

    const result = guard.handleRequest(null, payload, null, context);

    assert.equal(result, payload);
    assert.deepEqual(request.principal, {
      id: "usr-1",
      tenantId: "00000000-0000-4000-8000-000000000001",
      role: USER_ROLE.ADMIN,
      email: "admin@lia.local"
    });
    assert.deepEqual(request.user, request.principal);
  });

  it("AuthenticatedGuard accepts a hydrated principal contract", () => {
    const guard = new AuthenticatedGuard();
    const request: Record<string, unknown> = {
      user: {
        sub: "usr-1",
        tenantId: "00000000-0000-4000-8000-000000000001",
        role: USER_ROLE.CLINICIAN,
        email: "clinician@lia.local"
      }
    };

    const canActivate = guard.canActivate(createExecutionContext(request));

    assert.equal(canActivate, true);
    assert.deepEqual(request.principal, {
      id: "usr-1",
      tenantId: "00000000-0000-4000-8000-000000000001",
      role: USER_ROLE.CLINICIAN,
      email: "clinician@lia.local"
    });
  });

  it("RolesGuard evaluates roles against the normalized principal", () => {
    const reflector = new Reflector();
    const guard = new RolesGuard(reflector);
    const handler = () => undefined;
    const request: Record<string, unknown> = {
      principal: {
        id: "usr-1",
        tenantId: "00000000-0000-4000-8000-000000000001",
        role: USER_ROLE.ADMIN,
        email: "admin@lia.local"
      }
    };

    Reflect.defineMetadata(ROLES_KEY, [USER_ROLE.ADMIN], handler);

    const canActivate = guard.canActivate(createExecutionContext(request, handler));

    assert.equal(canActivate, true);
  });
});

function createExecutionContext(request: Record<string, unknown>, handler?: () => void) {
  return {
    getClass: () => class TestController {},
    getHandler: () => handler ?? (() => undefined),
    switchToHttp: () => ({
      getRequest: () => request
    })
  } as unknown as import("@nestjs/common").ExecutionContext;
}
