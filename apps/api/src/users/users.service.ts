import { Injectable } from "@nestjs/common";
import { compare, hash } from "bcrypt";
import { randomUUID } from "crypto";

import type { User } from "./entities/user.entity.js";
import { UserRole } from "../common/constants/user-role.js";
import { UsersRepository } from "./users.repository.js";

const BCRYPT_ROUNDS = 12;

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async create(email: string, password: string, role: UserRole, tenantId?: string): Promise<User> {
    const passwordHash = await this.hashPassword(password);
    const id = randomUUID();
    const finalTenantId = tenantId ?? (await this.usersRepository.findDefaultTenantId());

    return this.usersRepository.create({
      id,
      tenantId: finalTenantId,
      email,
      passwordHash,
      role
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findByEmail(email);
  }

  async findById(id: string): Promise<User | null> {
    return this.usersRepository.findById(id);
  }

  async validatePassword(user: User, password: string): Promise<boolean> {
    return compare(password, user.passwordHash);
  }

  async hashPassword(password: string): Promise<string> {
    return hash(password, BCRYPT_ROUNDS);
  }
}
