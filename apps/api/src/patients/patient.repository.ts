import { Inject, Injectable } from "@nestjs/common";

import {
  mapOptionalRow,
  resolveQueryExecutor,
  type QueryExecutor
} from "../common/db/repository.utils.js";
import type { AuthPrincipal } from "@lia/shared-types";
import { DatabaseService, type DatabaseTransaction } from "../db/database.service.js";
import type { Patient } from "./patient.entity.js";

interface CreatePatientData {
  id: string;
  tenantId: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  dateOfBirth?: Date | string;
}

interface PatientRow {
  id: string;
  tenant_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  date_of_birth: Date | null;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class PatientRepository {
  constructor(@Inject(DatabaseService) private readonly databaseService: DatabaseService) {}

  async findById(id: string, transaction?: DatabaseTransaction): Promise<Patient | null> {
    const result = await this.getExecutor(transaction).query<PatientRow>(
      `SELECT id, tenant_id, first_name, last_name, email, phone, date_of_birth, created_at, updated_at
       FROM patients
       WHERE id = $1`,
      [id]
    );
    return mapOptionalRow(result.rows[0], (row) => this.mapRowToPatient(row));
  }

  async create(data: CreatePatientData, transaction?: DatabaseTransaction): Promise<Patient> {
    const result = await this.getExecutor(transaction).query<PatientRow>(
      `INSERT INTO patients (id, tenant_id, first_name, last_name, email, phone, date_of_birth, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       RETURNING id, tenant_id, first_name, last_name, email, phone, date_of_birth, created_at, updated_at`,
      [
        data.id,
        data.tenantId,
        data.firstName,
        data.lastName,
        data.email,
        data.phone,
        data.dateOfBirth
      ]
    );
    return this.mapRowToPatient(result.rows[0]!);
  }

  async listByTenant(principal: AuthPrincipal, tenantId: string): Promise<Patient[]> {
    const result = await this.databaseService.query<PatientRow>(
      `SELECT id, tenant_id, first_name, last_name, email, phone, date_of_birth, created_at, updated_at
       FROM patients
       WHERE tenant_id = $1
       ORDER BY last_name, first_name`,
      [tenantId]
    );
    return result.rows.map((row) => this.mapRowToPatient(row));
  }

  // Legacy method for backwards compatibility - now uses database
  findByIdWithinTenant(patientId: string, tenantId: string): Promise<Patient | null> {
    return this.findByTenantId(patientId, tenantId);
  }

  private async findByTenantId(
    patientId: string,
    tenantId: string,
    transaction?: DatabaseTransaction
  ): Promise<Patient | null> {
    const result = await this.getExecutor(transaction).query<PatientRow>(
      `SELECT id, tenant_id, first_name, last_name, email, phone, date_of_birth, created_at, updated_at
       FROM patients
       WHERE id = $1 AND tenant_id = $2`,
      [patientId, tenantId]
    );
    return mapOptionalRow(result.rows[0], (row) => this.mapRowToPatient(row));
  }

  private mapRowToPatient(row: PatientRow): Patient {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email ?? undefined,
      phone: row.phone ?? undefined,
      dateOfBirth: row.date_of_birth ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private getExecutor(transaction?: DatabaseTransaction): QueryExecutor {
    return resolveQueryExecutor(this.databaseService, transaction);
  }
}
