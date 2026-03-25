import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { USER_ROLE } from "../common/constants/user-role.js";
import type { User } from "../users/entities/user.entity.js";
import { AdminService } from "./admin.service.js";
import type { Tenant } from "./admin.repository.js";
import { AdminRepository } from "./admin.repository.js";
import { UsersService } from "../users/users.service.js";

const MOCK_TENANTS: Tenant[] = [
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

const MOCK_USER: User = {
  id: "usr-new",
  email: "new.user@lia.local",
  role: USER_ROLE.CLINICIAN,
  tenantId: "00000000-0000-4000-8000-000000000001",
  passwordHash: "$2a$12$hashed",
  createdAt: new Date("2026-03-24T12:00:00.000Z"),
  updatedAt: new Date("2026-03-24T12:00:00.000Z")
} as const;

describe("AdminService", () => {
  describe("listTenants()", () => {
    it("returns all tenants from repository", async () => {
      let calledListTenants = false;
      const mockAdminRepository = {
        listTenants: async () => {
          calledListTenants = true;
          return [...MOCK_TENANTS];
        },
        searchUsers: async () => [],
        searchPatients: async () => [],
        searchAppointments: async () => [],
        searchLogs: async () => [],
        findTenantById: async () => null
      } as unknown as AdminRepository;

      const mockUsersService = {} as unknown as UsersService;

      const service = new AdminService(mockAdminRepository, mockUsersService);
      const result = await service.listTenants();

      assert.ok(calledListTenants);
      assert.equal(result.length, 2);
      assert.deepEqual(result, MOCK_TENANTS);
    });

    it("returns empty array when no tenants exist", async () => {
      const mockAdminRepository = {
        listTenants: async () => [],
        searchUsers: async () => [],
        searchPatients: async () => [],
        searchAppointments: async () => [],
        searchLogs: async () => [],
        findTenantById: async () => null
      } as unknown as AdminRepository;

      const mockUsersService = {} as unknown as UsersService;

      const service = new AdminService(mockAdminRepository, mockUsersService);
      const result = await service.listTenants();

      assert.equal(result.length, 0);
      assert.deepEqual(result, []);
    });

    it("orders tenants by name (repository responsibility)", async () => {
      // The ordering is done in the repository SQL query
      // The service just returns what the repository provides
      const orderedTenants: Tenant[] = [
        {
          id: "00000000-0000-4000-8000-000000000002",
          slug: "downtown",
          name: "Downtown Location",
          createdAt: new Date("2026-03-21T10:00:00.000Z")
        },
        {
          id: "00000000-0000-4000-8000-000000000001",
          slug: "main-clinic",
          name: "Main Clinic",
          createdAt: new Date("2026-03-20T12:00:00.000Z")
        }
      ];

      const mockAdminRepository = {
        listTenants: async () => orderedTenants,
        searchUsers: async () => [],
        searchPatients: async () => [],
        searchAppointments: async () => [],
        searchLogs: async () => [],
        findTenantById: async () => null
      } as unknown as AdminRepository;

      const mockUsersService = {} as unknown as UsersService;

      const service = new AdminService(mockAdminRepository, mockUsersService);
      const result = await service.listTenants();

      assert.equal(result[0].name, "Downtown Location");
      assert.equal(result[1].name, "Main Clinic");
    });
  });

  describe("search()", () => {
    it("searches all types by default when types parameter is not provided", async () => {
      let searchQuery = "";
      const searchCalls: Array<{ type: string; query: string }> = [];

      const mockAdminRepository = {
        listTenants: async () => MOCK_TENANTS,
        searchUsers: async (query: string) => {
          searchCalls.push({ type: "users", query });
          searchQuery = query;
          return [
            { id: "usr-1", email: "test@test.com", role: "admin", tenantId: "t-1", rank: 0.9 }
          ];
        },
        searchPatients: async (query: string) => {
          searchCalls.push({ type: "patients", query });
          return [
            {
              id: "pat-1",
              firstName: "John",
              lastName: "Doe",
              email: "john@test.com",
              tenantId: "t-1",
              rank: 0.8
            }
          ];
        },
        searchAppointments: async (query: string) => {
          searchCalls.push({ type: "appointments", query });
          return [
            { id: "apt-1", patientId: "p-1", specialistId: "s-1", tenantId: "t-1", rank: 0.7 }
          ];
        },
        searchLogs: async (query: string) => {
          searchCalls.push({ type: "logs", query });
          return [{ id: "log-1", action: "test", entityType: "user", tenantId: "t-1", rank: 0.6 }];
        },
        findTenantById: async () => null
      } as unknown as AdminRepository;

      const mockUsersService = {} as unknown as UsersService;

      const service = new AdminService(mockAdminRepository, mockUsersService);
      const result = await service.search("john");

      assert.equal(searchQuery, "john");
      assert.equal(searchCalls.length, 4);
      assert.equal(searchCalls[0].type, "users");
      assert.equal(searchCalls[1].type, "patients");
      assert.equal(searchCalls[2].type, "appointments");
      assert.equal(searchCalls[3].type, "logs");
      assert.ok((result as Record<string, unknown>).users);
      assert.ok((result as Record<string, unknown>).patients);
      assert.ok((result as Record<string, unknown>).appointments);
      assert.ok((result as Record<string, unknown>).logs);
    });

    it("filters by types parameter when provided", async () => {
      const searchCalls: Array<{ type: string; query: string }> = [];

      const mockAdminRepository = {
        listTenants: async () => MOCK_TENANTS,
        searchUsers: async (query: string) => {
          searchCalls.push({ type: "users", query });
          return [
            { id: "usr-1", email: "test@test.com", role: "admin", tenantId: "t-1", rank: 0.9 }
          ];
        },
        searchPatients: async (query: string) => {
          searchCalls.push({ type: "patients", query });
          return [
            {
              id: "pat-1",
              firstName: "John",
              lastName: "Doe",
              email: "john@test.com",
              tenantId: "t-1",
              rank: 0.8
            }
          ];
        },
        searchAppointments: async () => {
          // Should not be called
          return [];
        },
        searchLogs: async () => {
          // Should not be called
          return [];
        },
        findTenantById: async () => null
      } as unknown as AdminRepository;

      const mockUsersService = {} as unknown as UsersService;

      const service = new AdminService(mockAdminRepository, mockUsersService);
      const result = await service.search("john", "users,patients");

      assert.equal(searchCalls.length, 2);
      assert.equal(searchCalls[0].type, "users");
      assert.equal(searchCalls[1].type, "patients");
      assert.ok((result as Record<string, unknown>).users);
      assert.ok((result as Record<string, unknown>).patients);
      assert.equal((result as Record<string, unknown>).appointments, undefined);
      assert.equal((result as Record<string, unknown>).logs, undefined);
    });

    it("handles whitespace in types parameter", async () => {
      const searchCalls: Array<{ type: string }> = [];

      const mockAdminRepository = {
        listTenants: async () => MOCK_TENANTS,
        searchUsers: async () => {
          searchCalls.push({ type: "users" });
          return [
            { id: "usr-1", email: "test@test.com", role: "admin", tenantId: "t-1", rank: 0.9 }
          ];
        },
        searchPatients: async () => {
          searchCalls.push({ type: "patients" });
          return [];
        },
        searchAppointments: async () => [],
        searchLogs: async () => [],
        findTenantById: async () => null
      } as unknown as AdminRepository;

      const mockUsersService = {} as unknown as UsersService;

      const service = new AdminService(mockAdminRepository, mockUsersService);
      await service.search("john", " users , patients ");

      assert.equal(searchCalls.length, 2);
      assert.equal(searchCalls[0].type, "users");
      assert.equal(searchCalls[1].type, "patients");
    });

    it("returns empty arrays for all types when no matching results", async () => {
      const mockAdminRepository = {
        listTenants: async () => MOCK_TENANTS,
        searchUsers: async () => [],
        searchPatients: async () => [],
        searchAppointments: async () => [],
        searchLogs: async () => [],
        findTenantById: async () => null
      } as unknown as AdminRepository;

      const mockUsersService = {} as unknown as UsersService;

      const service = new AdminService(mockAdminRepository, mockUsersService);
      const result = await service.search("nonexistent");

      // Service returns keys for all searched types with empty arrays
      assert.deepEqual((result as Record<string, unknown>).users, []);
      assert.deepEqual((result as Record<string, unknown>).patients, []);
      assert.deepEqual((result as Record<string, unknown>).appointments, []);
      assert.deepEqual((result as Record<string, unknown>).logs, []);
    });

    it("uses FTS query string for searching", async () => {
      let receivedQuery = "";

      const mockAdminRepository = {
        listTenants: async () => MOCK_TENANTS,
        searchUsers: async (query: string) => {
          receivedQuery = query;
          return [
            { id: "usr-1", email: "test@test.com", role: "admin", tenantId: "t-1", rank: 0.9 }
          ];
        },
        searchPatients: async () => [],
        searchAppointments: async () => [],
        searchLogs: async () => [],
        findTenantById: async () => null
      } as unknown as AdminRepository;

      const mockUsersService = {} as unknown as UsersService;

      const service = new AdminService(mockAdminRepository, mockUsersService);
      await service.search("john doe");

      // The FTS query should be passed to repository
      assert.equal(receivedQuery, "john doe");
    });
  });

  describe("createUser()", () => {
    it("creates user with role and tenant assignment", async () => {
      let createUserEmail = "";
      let createUserPassword = "";
      let createUserRole: (typeof USER_ROLE)[keyof typeof USER_ROLE] | undefined;
      let createUserTenantId: string | undefined;

      const mockAdminRepository = {
        listTenants: async () => MOCK_TENANTS,
        searchUsers: async () => [],
        searchPatients: async () => [],
        searchAppointments: async () => [],
        searchLogs: async () => [],
        findTenantById: async (id: string) => {
          return id === "00000000-0000-4000-8000-000000000001" ? MOCK_TENANTS[0] : null;
        }
      } as unknown as AdminRepository;

      const mockUsersService = {
        create: async (
          email: string,
          password: string,
          role: (typeof USER_ROLE)[keyof typeof USER_ROLE],
          tenantId?: string
        ) => {
          createUserEmail = email;
          createUserPassword = password;
          createUserRole = role;
          createUserTenantId = tenantId;
          return MOCK_USER;
        }
      } as unknown as UsersService;

      const service = new AdminService(mockAdminRepository, mockUsersService);
      const result = await service.createUser(
        "new.user@lia.local",
        "SecurePass123",
        USER_ROLE.CLINICIAN,
        "00000000-0000-4000-8000-000000000001"
      );

      assert.equal(createUserEmail, "new.user@lia.local");
      assert.equal(createUserPassword, "SecurePass123");
      assert.equal(createUserRole, USER_ROLE.CLINICIAN);
      assert.equal(createUserTenantId, "00000000-0000-4000-8000-000000000001");
      assert.deepEqual(result, MOCK_USER);
    });

    it("validates that tenant exists before creating user", async () => {
      let findTenantByIdCalled = false;
      let tenantIdParam = "";

      const mockAdminRepository = {
        listTenants: async () => MOCK_TENANTS,
        searchUsers: async () => [],
        searchPatients: async () => [],
        searchAppointments: async () => [],
        searchLogs: async () => [],
        findTenantById: async (id: string) => {
          findTenantByIdCalled = true;
          tenantIdParam = id;
          return null; // Tenant not found
        }
      } as unknown as AdminRepository;

      const mockUsersService = {
        create: async () => MOCK_USER
      } as unknown as UsersService;

      const service = new AdminService(mockAdminRepository, mockUsersService);

      await assert.rejects(
        () => service.createUser("test@test.com", "pass", USER_ROLE.CLINICIAN, "invalid-tenant-id"),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.equal(error.message, "Tenant not found");
          return true;
        }
      );

      assert.ok(findTenantByIdCalled);
      assert.equal(tenantIdParam, "invalid-tenant-id");
    });

    it("delegates to UsersService.create() with explicit tenantId", async () => {
      let receivedTenantId: string | undefined = "";

      const mockAdminRepository = {
        listTenants: async () => MOCK_TENANTS,
        searchUsers: async () => [],
        searchPatients: async () => [],
        searchAppointments: async () => [],
        searchLogs: async () => [],
        findTenantById: async (id: string) => {
          return id === "00000000-0000-4000-8000-000000000001" ? MOCK_TENANTS[0] : null;
        }
      } as unknown as AdminRepository;

      const mockUsersService = {
        create: async (
          _email: string,
          _password: string,
          _role: (typeof USER_ROLE)[keyof typeof USER_ROLE],
          tenantId?: string
        ) => {
          receivedTenantId = tenantId;
          return MOCK_USER;
        }
      } as unknown as UsersService;

      const service = new AdminService(mockAdminRepository, mockUsersService);
      await service.createUser(
        "test@test.com",
        "pass",
        USER_ROLE.CLINICIAN,
        "00000000-0000-4000-8000-000000000001"
      );

      assert.equal(receivedTenantId, "00000000-0000-4000-8000-000000000001");
    });

    it("returns created user object", async () => {
      const mockAdminRepository = {
        listTenants: async () => MOCK_TENANTS,
        searchUsers: async () => [],
        searchPatients: async () => [],
        searchAppointments: async () => [],
        searchLogs: async () => [],
        findTenantById: async (id: string) => {
          return id === "00000000-0000-4000-8000-000000000001" ? MOCK_TENANTS[0] : null;
        }
      } as unknown as AdminRepository;

      const mockUsersService = {
        create: async () => MOCK_USER
      } as unknown as UsersService;

      const service = new AdminService(mockAdminRepository, mockUsersService);
      const result = await service.createUser(
        "test@test.com",
        "pass",
        USER_ROLE.CLINICIAN,
        "00000000-0000-4000-8000-000000000001"
      );

      assert.equal(result.id, MOCK_USER.id);
      assert.equal(result.email, MOCK_USER.email);
      assert.equal(result.role, MOCK_USER.role);
      assert.equal(result.tenantId, MOCK_USER.tenantId);
      assert.equal(result.createdAt.toISOString(), MOCK_USER.createdAt.toISOString());
    });
  });
});
