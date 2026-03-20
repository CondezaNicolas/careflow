import { Inject, Injectable } from "@nestjs/common";

import {
  mapOptionalRow,
  resolveQueryExecutor,
  type QueryExecutor
} from "../common/db/repository.utils.js";
import { tenantIdFromScope, type TenantScopeInput } from "../common/tenant/tenant-scope.js";
import { DatabaseService, type DatabaseTransaction } from "../db/database.service.js";
import type { RefreshToken } from "./entities/refresh-token.entity.js";
import type { User } from "./entities/user.entity.js";

interface CreateUserData {
  id: string;
  tenantId: string;
  email: string;
  passwordHash: string;
  role: string;
}

interface UpdateUserData {
  email?: string;
  passwordHash?: string;
  role?: string;
}

@Injectable()
export class UsersRepository {
  constructor(@Inject(DatabaseService) private readonly databaseService: DatabaseService) {}

  async findByEmail(email: string, transaction?: DatabaseTransaction): Promise<User | null> {
    const result = await this.getExecutor(transaction).query<UserRow>(
      `SELECT u.id, u.tenant_id, u.email, u.password_hash, u.created_at, u.updated_at, r.name as role
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE LOWER(u.email) = $1`,
      [normalizeEmail(email)]
    );
    return mapOptionalRow(result.rows[0], (row) => this.mapRowToUser(row));
  }

  async findById(id: string, transaction?: DatabaseTransaction): Promise<User | null> {
    const result = await this.getExecutor(transaction).query<UserRow>(
      `SELECT u.id, u.tenant_id, u.email, u.password_hash, u.created_at, u.updated_at, r.name as role
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.id = $1`,
      [id]
    );
    return mapOptionalRow(result.rows[0], (row) => this.mapRowToUser(row));
  }

  async create(data: CreateUserData, transaction?: DatabaseTransaction): Promise<User> {
    const result = await this.getExecutor(transaction).query<UserRow>(
      `WITH resolved_role AS (
         SELECT id
         FROM roles
         WHERE name = $5
       )
       INSERT INTO users (id, tenant_id, email, password_hash, role_id, created_at, updated_at)
       SELECT $1, $2, $3, $4, resolved_role.id, NOW(), NOW()
       FROM resolved_role
       RETURNING id, tenant_id, email, password_hash, created_at, updated_at`,
      [data.id, data.tenantId, normalizeEmail(data.email), data.passwordHash, data.role]
    );
    if (!result.rows[0]) {
      throw new Error(`Role '${data.role}' not found`);
    }

    return this.mapRowToUser({ ...result.rows[0], role: data.role });
  }

  async update(
    id: string,
    data: UpdateUserData,
    transaction?: DatabaseTransaction
  ): Promise<User | null> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;
    const executor = this.getExecutor(transaction);

    if (data.email !== undefined) {
      sets.push(`email = $${paramIndex++}`);
      values.push(normalizeEmail(data.email));
    }
    if (data.passwordHash !== undefined) {
      sets.push(`password_hash = $${paramIndex++}`);
      values.push(data.passwordHash);
    }
    if (data.role !== undefined) {
      const roleResult = await executor.query<{ id: string }>(
        `SELECT id FROM roles WHERE name = $1`,
        [data.role]
      );
      const roleId = roleResult.rows[0]?.id;
      if (!roleId) {
        throw new Error(`Role '${data.role}' not found`);
      }

      sets.push(`role_id = $${paramIndex++}`);
      values.push(roleId);
    }

    if (sets.length === 0) {
      return this.findById(id, transaction);
    }

    values.push(id);

    const result = await executor.query<UserRow>(
      `UPDATE users 
       SET ${sets.join(", ")}, updated_at = NOW()
       WHERE id = $${paramIndex}
       RETURNING id, tenant_id, email, password_hash, created_at, updated_at`,
      values
    );
    if (!result.rows[0]) return null;
    const userWithRole = await executor.query<UserRow>(
      `SELECT u.id, u.tenant_id, u.email, u.password_hash, u.created_at, u.updated_at, r.name as role
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.id = $1`,
      [id]
    );
    return mapOptionalRow(userWithRole.rows[0], (row) => this.mapRowToUser(row));
  }

  async findDefaultTenantId(transaction?: DatabaseTransaction): Promise<string> {
    const result = await this.getExecutor(transaction).query<{ id: string }>(
      `SELECT id
       FROM tenants
       ORDER BY
         CASE slug
           WHEN 'dev-tenant' THEN 0
           WHEN 'tenant-demo' THEN 1
           ELSE 2
         END,
         created_at ASC,
         id ASC
       LIMIT 1`
    );
    const tenantId = result.rows[0]?.id;
    if (!tenantId) {
      throw new Error("No tenant available for user provisioning");
    }

    return tenantId;
  }

  private mapRowToUser(row: UserRow): User {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      email: row.email,
      passwordHash: row.password_hash,
      role: row.role as User["role"],
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  async saveRefreshToken(
    data: {
      userId: string;
      tenantId: string;
      tokenHash: string;
      family: string;
      expiresAt: Date;
    },
    transaction?: DatabaseTransaction
  ): Promise<{ id: string }> {
    const result = await this.getExecutor(transaction).query<{ id: string }>(
      `INSERT INTO auth_refresh_tokens (user_id, tenant_id, token_hash, family, expires_at, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING id`,
      [data.userId, data.tenantId, data.tokenHash, data.family, data.expiresAt]
    );

    return {
      id: result.rows[0]!.id
    };
  }

  async isRefreshTokenRevoked(
    tokenHash: string,
    transaction?: DatabaseTransaction
  ): Promise<boolean> {
    const result = await this.getExecutor(transaction).query<{ exists: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM auth_refresh_tokens 
         WHERE token_hash = $1 AND revoked_at IS NOT NULL
       ) AS exists`,
      [tokenHash]
    );
    return result.rows[0]?.exists ?? false;
  }

  async revokeRefreshToken(
    tokenHash: string,
    replacedByTokenId?: string,
    transaction?: DatabaseTransaction
  ): Promise<void> {
    await this.getExecutor(transaction).query(
      `UPDATE auth_refresh_tokens 
       SET revoked_at = NOW(), replaced_by_token = COALESCE($2, replaced_by_token)
       WHERE token_hash = $1`,
      [tokenHash, replacedByTokenId ?? null]
    );
  }

  async revokeAllTokensInFamily(family: string, transaction?: DatabaseTransaction): Promise<void> {
    await this.getExecutor(transaction).query(
      `UPDATE auth_refresh_tokens 
       SET revoked_at = NOW()
       WHERE family = $1 AND revoked_at IS NULL`,
      [family]
    );
  }

  async revokeActiveRefreshTokensForUser(
    userId: string,
    scope: TenantScopeInput,
    transaction?: DatabaseTransaction
  ): Promise<void> {
    await this.getExecutor(transaction).query(
      `UPDATE auth_refresh_tokens
       SET revoked_at = NOW()
       WHERE user_id = $1
         AND tenant_id = $2
         AND revoked_at IS NULL`,
      [userId, tenantIdFromScope(scope)]
    );
  }

  async findRefreshTokenByHash(
    tokenHash: string,
    transaction?: DatabaseTransaction
  ): Promise<RefreshToken | null> {
    const result = await this.getExecutor(transaction).query<RefreshTokenRow>(
      `SELECT id, user_id, tenant_id, token_hash, family, expires_at, created_at, revoked_at, replaced_by_token
       FROM auth_refresh_tokens 
       WHERE token_hash = $1`,
      [tokenHash]
    );
    return mapOptionalRow(result.rows[0], mapRefreshTokenRow);
  }

  private getExecutor(transaction?: DatabaseTransaction): QueryExecutor {
    return resolveQueryExecutor(this.databaseService, transaction);
  }
}

interface UserRow {
  id: string;
  tenant_id: string;
  email: string;
  password_hash: string;
  role: string;
  created_at: Date;
  updated_at: Date;
}

interface RefreshTokenRow {
  id: string;
  user_id: string;
  tenant_id: string;
  token_hash: string;
  family: string;
  expires_at: Date;
  created_at: Date;
  revoked_at: Date | null;
  replaced_by_token: string | null;
}

function mapRefreshTokenRow(row: RefreshTokenRow): RefreshToken {
  return {
    id: row.id,
    userId: row.user_id,
    tenantId: row.tenant_id,
    tokenHash: row.token_hash,
    family: row.family,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
    replacedByTokenId: row.replaced_by_token
  };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
