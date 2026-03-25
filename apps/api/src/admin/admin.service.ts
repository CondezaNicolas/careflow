import { Injectable } from "@nestjs/common";

import type { User } from "../users/entities/user.entity.js";
import type { UserRole } from "../common/constants/user-role.js";
import { USER_ROLE } from "../common/constants/user-role.js";
import type { Tenant } from "./admin.repository.js";
import { AdminRepository } from "./admin.repository.js";
import { UsersService } from "../users/users.service.js";

@Injectable()
export class AdminService {
  constructor(
    private readonly adminRepository: AdminRepository,
    private readonly usersService: UsersService
  ) {}

  async listTenants() {
    return this.adminRepository.listTenants();
  }

  async search(query: string, types?: string) {
    const typeSet = types
      ? types.split(",").map((t) => t.trim())
      : ["users", "patients", "appointments", "logs"];
    const results: Record<string, unknown> = {};

    if (typeSet.includes("users")) {
      results.users = await this.adminRepository.searchUsers(query);
    }
    if (typeSet.includes("patients")) {
      results.patients = await this.adminRepository.searchPatients(query);
    }
    if (typeSet.includes("appointments")) {
      results.appointments = await this.adminRepository.searchAppointments(query);
    }
    if (typeSet.includes("logs")) {
      results.logs = await this.adminRepository.searchLogs(query);
    }

    return results;
  }

  async createUser(
    email: string,
    password: string,
    role: UserRole,
    tenantId: string
  ): Promise<User> {
    // Validate tenant exists
    const tenant = await this.adminRepository.findTenantById(tenantId);
    if (!tenant) {
      throw new Error("Tenant not found");
    }

    return this.usersService.create(email, password, role, tenantId);
  }
}
