import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { USER_ROLE } from "../common/constants/user-role.js";
import { UsersService } from "./users.service.js";

describe("UsersService", () => {
  it("provisions users into the repository default tenant when none is provided", async () => {
    let created:
      | {
          email: string;
          id: string;
          passwordHash: string;
          role: string;
          tenantId: string;
        }
      | undefined;

    const repository = {
      findDefaultTenantId: async () => "20000000-0000-0000-0000-000000000099",
      create: async (data: {
        email: string;
        id: string;
        passwordHash: string;
        role: string;
        tenantId: string;
      }) => {
        created = data;
        return {
          ...data,
          createdAt: new Date("2026-03-20T12:00:00.000Z"),
          updatedAt: new Date("2026-03-20T12:00:00.000Z")
        };
      }
    } as unknown as import("./users.repository.js").UsersRepository;

    const service = new UsersService(repository);
    const user = await service.create("Clinician@Lia.Local", "ValidPass1", USER_ROLE.CLINICIAN);

    assert.equal(created?.tenantId, "20000000-0000-0000-0000-000000000099");
    assert.equal(created?.email, "Clinician@Lia.Local");
    assert.equal(user.tenantId, "20000000-0000-0000-0000-000000000099");
    assert.match(created?.passwordHash ?? "", /^\$2[aby]\$12\$/u);
  });
});
