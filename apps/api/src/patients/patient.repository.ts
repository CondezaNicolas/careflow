import { Injectable } from "@nestjs/common";

import type { TenantScope } from "../common/tenant/tenant-scope.js";
import type { Patient } from "./patient.entity.js";

@Injectable()
export class PatientRepository {
  private readonly rows: Patient[] = [
    { id: "pt-1", tenantId: "tenant-demo", fullName: "Jane Doe" },
    { id: "pt-2", tenantId: "tenant-other", fullName: "John Other" }
  ];

  findByIdWithinTenant(patientId: string, scope: TenantScope): Patient | null {
    return this.rows.find((row) => row.id === patientId && row.tenantId === scope.tenantId) ?? null;
  }
}
