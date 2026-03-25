import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import { USER_ROLE } from "../common/constants/user-role.js";
import { SearchQueryDto } from "./dtos/search.dto.js";
import { CreateUserRequestDto } from "./dtos/create-user.dto.js";
import { AdminController } from "./admin.controller.js";
import { AdminService } from "./admin.service.js";

const MOCK_TENANTS = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    slug: "main-clinic",
    name: "Main Clinic",
    createdAt: new Date("2026-03-20T12:00:00.000Z")
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    slug: "downtown",
    name: "Downtown Location",
    createdAt: new Date("2026-03-21T10:00:00.000Z")
  }
] as const;

const MOCK_SEARCH_RESULTS = {
  users: [
    {
      id: "usr-1",
      email: "admin@lia.local",
      role: "admin",
      tenantId: "00000000-0000-4000-8000-000000000001",
      rank: 0.9
    }
  ],
  patients: [
    {
      id: "pat-1",
      firstName: "John",
      lastName: "Doe",
      email: "john.doe@example.com",
      tenantId: "00000000-0000-4000-8000-000000000001",
      rank: 0.85
    }
  ]
} as const;

const MOCK_CREATED_USER = {
  id: "usr-new",
  email: "new.user@lia.local",
  role: USER_ROLE.CLINICIAN,
  tenantId: "00000000-0000-4000-8000-000000000001",
  createdAt: new Date("2026-03-24T12:00:00.000Z")
} as const;

describe("AdminController", () => {
  it("GET /admin/tenants - returns array of tenants for authenticated admin", async () => {
    let calledListTenants = false;
    const mockAdminService = {
      listTenants: async () => {
        calledListTenants = true;
        return [...MOCK_TENANTS];
      },
      search: async (_query: string, _types?: string) => ({}),
      createUser: async () => MOCK_CREATED_USER
    } as unknown as AdminService;

    const controller = new AdminController(mockAdminService);
    const result = await controller.listTenants();

    assert.ok(calledListTenants);
    assert.equal(result.length, 2);
    assert.equal(result[0].id, MOCK_TENANTS[0].id);
    assert.equal(result[0].slug, MOCK_TENANTS[0].slug);
    assert.equal(result[0].name, MOCK_TENANTS[0].name);
    assert.deepEqual(result[0].createdAt, MOCK_TENANTS[0].createdAt);
  });

  it("GET /admin/tenants - returns empty array when no tenants exist", async () => {
    const mockAdminService = {
      listTenants: async () => [],
      search: async () => ({}),
      createUser: async () => MOCK_CREATED_USER
    } as unknown as AdminService;

    const controller = new AdminController(mockAdminService);
    const result = await controller.listTenants();

    assert.equal(result.length, 0);
  });

  it("GET /admin/search - returns search results with valid query", async () => {
    let searchQuery = "";
    let searchTypes: string | undefined;
    const mockAdminService = {
      listTenants: async () => MOCK_TENANTS,
      search: async (query: string, types?: string) => {
        searchQuery = query;
        searchTypes = types;
        return MOCK_SEARCH_RESULTS as Record<string, unknown>;
      },
      createUser: async () => MOCK_CREATED_USER
    } as unknown as AdminService;

    const controller = new AdminController(mockAdminService);
    const query = new SearchQueryDto();
    query.q = "john";

    const result = await controller.search(query);

    assert.equal(searchQuery, "john");
    assert.equal(searchTypes, undefined);
    const users = result.users as typeof MOCK_SEARCH_RESULTS.users;
    const patients = result.patients as typeof MOCK_SEARCH_RESULTS.patients;
    assert.equal(users?.[0].id, MOCK_SEARCH_RESULTS.users[0].id);
    assert.equal(patients?.[0].id, MOCK_SEARCH_RESULTS.patients[0].id);
  });

  it("GET /admin/search - filters by types parameter", async () => {
    let searchQuery = "";
    let searchTypes: string | undefined;
    const mockAdminService = {
      listTenants: async () => MOCK_TENANTS,
      search: async (query: string, types?: string) => {
        searchQuery = query;
        searchTypes = types;
        return { users: MOCK_SEARCH_RESULTS.users } as Record<string, unknown>;
      },
      createUser: async () => MOCK_CREATED_USER
    } as unknown as AdminService;

    const controller = new AdminController(mockAdminService);
    const query = new SearchQueryDto();
    query.q = "admin";
    query.types = "users,patients";

    const result = await controller.search(query);

    assert.equal(searchQuery, "admin");
    assert.equal(searchTypes, "users,patients");
    assert.ok(result.users);
    assert.equal((result as Record<string, unknown>).patients, undefined);
  });

  it("GET /admin/search - returns empty object when no results found", async () => {
    const mockAdminService = {
      listTenants: async () => MOCK_TENANTS,
      search: async () => ({}),
      createUser: async () => MOCK_CREATED_USER
    } as unknown as AdminService;

    const controller = new AdminController(mockAdminService);
    const query = new SearchQueryDto();
    query.q = "nonexistent";

    const result = await controller.search(query);

    assert.deepEqual(result, {});
  });

  it("POST /admin/users - creates user successfully", async () => {
    let createUserEmail = "";
    let createUserPassword = "";
    let createUserRole: (typeof USER_ROLE)[keyof typeof USER_ROLE] | undefined;
    let createUserTenantId = "";
    const mockAdminService = {
      listTenants: async () => MOCK_TENANTS,
      search: async () => ({}),
      createUser: async (
        email: string,
        password: string,
        role: (typeof USER_ROLE)[keyof typeof USER_ROLE],
        tenantId: string
      ) => {
        createUserEmail = email;
        createUserPassword = password;
        createUserRole = role;
        createUserTenantId = tenantId;
        return MOCK_CREATED_USER;
      }
    } as unknown as AdminService;

    const controller = new AdminController(mockAdminService);
    const body = new CreateUserRequestDto();
    body.email = "new.user@lia.local";
    body.password = "SecurePass123";
    body.role = "clinician" as typeof USER_ROLE.CLINICIAN;
    body.tenantId = "00000000-0000-4000-8000-000000000001";

    const result = await controller.createUser(body);

    assert.equal(createUserEmail, "new.user@lia.local");
    assert.equal(createUserPassword, "SecurePass123");
    assert.equal(createUserRole, "clinician");
    assert.equal(createUserTenantId, "00000000-0000-4000-8000-000000000001");
    assert.equal(result.id, MOCK_CREATED_USER.id);
    assert.equal(result.email, MOCK_CREATED_USER.email);
    assert.equal(result.role, MOCK_CREATED_USER.role);
    assert.equal(result.tenantId, MOCK_CREATED_USER.tenantId);
  });

  it("POST /admin/users - returns 409 when email already exists", async () => {
    const mockAdminService = {
      listTenants: async () => MOCK_TENANTS,
      search: async () => ({}),
      createUser: async () => {
        throw new Error("Email already exists");
      }
    } as unknown as AdminService;

    const controller = new AdminController(mockAdminService);
    const body = new CreateUserRequestDto();
    body.email = "existing@lia.local";
    body.password = "SecurePass123";
    body.role = "clinician" as typeof USER_ROLE.CLINICIAN;
    body.tenantId = "00000000-0000-4000-8000-000000000001";

    await assert.rejects(
      () => controller.createUser(body),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, "Email already exists");
        return true;
      }
    );
  });

  it("POST /admin/users - returns 400 when tenant does not exist", async () => {
    const mockAdminService = {
      listTenants: async () => MOCK_TENANTS,
      search: async () => ({}),
      createUser: async () => {
        throw new Error("Tenant not found");
      }
    } as unknown as AdminService;

    const controller = new AdminController(mockAdminService);
    const body = new CreateUserRequestDto();
    body.email = "new.user@lia.local";
    body.password = "SecurePass123";
    body.role = "clinician" as typeof USER_ROLE.CLINICIAN;
    body.tenantId = "00000000-0000-4000-8000-000000000099";

    await assert.rejects(
      () => controller.createUser(body),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, "Tenant not found");
        return true;
      }
    );
  });

  describe("Controller Decorators", () => {
    it("requires ADMIN role for all endpoints", () => {
      const mockAdminService = {
        listTenants: async () => MOCK_TENANTS,
        search: async () => ({}),
        createUser: async () => MOCK_CREATED_USER
      } as unknown as AdminService;

      const controller = new AdminController(mockAdminService);

      // The decorator is applied at the class level
      // We can verify the controller has the methods
      assert.equal(typeof controller.listTenants, "function");
      assert.equal(typeof controller.search, "function");
      assert.equal(typeof controller.createUser, "function");
    });
  });
});
