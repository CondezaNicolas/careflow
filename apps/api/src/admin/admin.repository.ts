import { Inject, Injectable, NotFoundException } from "@nestjs/common";

import type { QueryExecutor } from "../common/db/repository.utils.js";
import { mapOptionalRow, resolveQueryExecutor } from "../common/db/repository.utils.js";
import { DatabaseService, type DatabaseTransaction } from "../db/database.service.js";

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  createdAt: Date;
}

interface UserSearchResult {
  id: string;
  email: string;
  role: string;
  tenantId: string;
  rank: number;
}

interface PatientSearchResult {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  tenantId: string;
  rank: number;
}

interface AppointmentSearchResult {
  id: string;
  patientId: string;
  specialistId: string;
  tenantId: string;
  rank: number;
}

interface LogSearchResult {
  id: string;
  action: string;
  entityType: string;
  tenantId: string;
  rank: number;
}

interface SearchResultRow {
  id: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  role?: string;
  patient_id?: string;
  specialist_id?: string;
  action?: string;
  entity_type?: string;
  tenant_id: string;
  rank: number;
}

@Injectable()
export class AdminRepository {
  constructor(
    @Inject(DatabaseService)
    private readonly databaseService: DatabaseService
  ) {}

  async listTenants(): Promise<Tenant[]> {
    const result = await this.getExecutor().query<TenantRow>(
      `SELECT id, slug, name, created_at
       FROM tenants
       ORDER BY name ASC`
    );

    return result.rows.map(this.mapRowToTenant);
  }

  async searchUsers(query: string): Promise<UserSearchResult[]> {
    const result = await this.getExecutor().query<SearchResultRow>(
      `SELECT
         u.id,
         u.email,
         r.name as role,
         u.tenant_id,
         ts_rank(u.search_vector, websearch_to_tsquery('english', $1)) as rank
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.search_vector @@ websearch_to_tsquery('english', $1)
       ORDER BY rank DESC
       LIMIT 10`,
      [query]
    );

    return result.rows.map<UserSearchResult>((row) => ({
      id: row.id,
      email: row.email!,
      role: row.role!,
      tenantId: row.tenant_id,
      rank: row.rank
    }));
  }

  async searchPatients(query: string): Promise<PatientSearchResult[]> {
    const result = await this.getExecutor().query<SearchResultRow>(
      `SELECT
         p.id,
         p.first_name,
         p.last_name,
         p.email,
         p.tenant_id,
         ts_rank(p.search_vector, websearch_to_tsquery('english', $1)) as rank
       FROM patients p
       WHERE p.search_vector @@ websearch_to_tsquery('english', $1)
       ORDER BY rank DESC
       LIMIT 10`,
      [query]
    );

    return result.rows.map<PatientSearchResult>((row) => ({
      id: row.id,
      firstName: row.first_name!,
      lastName: row.last_name!,
      email: row.email ?? null,
      tenantId: row.tenant_id,
      rank: row.rank
    }));
  }

  async searchAppointments(query: string): Promise<AppointmentSearchResult[]> {
    const result = await this.getExecutor().query<SearchResultRow>(
      `SELECT
         a.id,
         a.patient_id,
         a.specialist_id,
         a.tenant_id,
         ts_rank(a.search_vector, websearch_to_tsquery('english', $1)) as rank
       FROM scheduling_appointments a
       WHERE a.search_vector @@ websearch_to_tsquery('english', $1)
       ORDER BY rank DESC
       LIMIT 10`,
      [query]
    );

    return result.rows.map<AppointmentSearchResult>((row) => ({
      id: row.id,
      patientId: row.patient_id!,
      specialistId: row.specialist_id!,
      tenantId: row.tenant_id,
      rank: row.rank
    }));
  }

  async searchLogs(query: string): Promise<LogSearchResult[]> {
    const result = await this.getExecutor().query<SearchResultRow>(
      `SELECT
         e.id,
         e.action,
         e.entity_type,
         e.tenant_id,
         ts_rank(e.search_vector, websearch_to_tsquery('english', $1)) as rank
       FROM domain_audit_events e
       WHERE e.search_vector @@ websearch_to_tsquery('english', $1)
       ORDER BY rank DESC
       LIMIT 10`,
      [query]
    );

    return result.rows.map<LogSearchResult>((row) => ({
      id: row.id,
      action: row.action!,
      entityType: row.entity_type!,
      tenantId: row.tenant_id,
      rank: row.rank
    }));
  }

  async findTenantById(id: string): Promise<Tenant | null> {
    const result = await this.getExecutor().query<TenantRow>(
      `SELECT id, slug, name, created_at
       FROM tenants
       WHERE id = $1`,
      [id]
    );

    return mapOptionalRow(result.rows[0], this.mapRowToTenant);
  }

  private mapRowToTenant(row: TenantRow): Tenant {
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      createdAt: row.created_at
    };
  }

  private getExecutor(transaction?: DatabaseTransaction): QueryExecutor {
    return resolveQueryExecutor(this.databaseService, transaction);
  }
}

interface TenantRow {
  id: string;
  slug: string;
  name: string;
  created_at: Date;
}
