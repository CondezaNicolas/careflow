import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { USER_ROLE } from "../constants/user-role.js";
import { requireClinicalWritePermission } from "./permissions.js";

describe("clinical write permission", () => {
  it("allows clinician and admin", () => {
    assert.doesNotThrow(() => requireClinicalWritePermission(USER_ROLE.ADMIN));
    assert.doesNotThrow(() => requireClinicalWritePermission(USER_ROLE.CLINICIAN));
  });

  it("blocks receptionist and patient", () => {
    assert.throws(() => requireClinicalWritePermission(USER_ROLE.RECEPTIONIST));
    assert.throws(() => requireClinicalWritePermission(USER_ROLE.PATIENT));
  });
});
