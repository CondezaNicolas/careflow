import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { USER_ROLE } from "../constants/user-role.js";
import { assertTenantScope } from "./tenant-scope.js";

describe("tenant scope", () => {
  it("allows same-tenant access", () => {
    const principal = {
      id: "usr-1",
      tenantId: "tenant-demo",
      role: USER_ROLE.CLINICIAN,
      email: "x@lia.local"
    };

    const result = assertTenantScope(principal, "tenant-demo");
    assert.equal(result.tenantId, "tenant-demo");
  });

  it("blocks cross-tenant access", () => {
    const principal = {
      id: "usr-1",
      tenantId: "tenant-demo",
      role: USER_ROLE.CLINICIAN,
      email: "x@lia.local"
    };

    assert.throws(() => assertTenantScope(principal, "tenant-other"));
  });
});
