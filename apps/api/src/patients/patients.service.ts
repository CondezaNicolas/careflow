import { Inject, Injectable, NotFoundException } from "@nestjs/common";

import type { AuthPrincipal } from "@lia/shared-types";

import { assertTenantScope, tenantScopeFromPrincipal } from "../common/tenant/tenant-scope.js";
import { PatientRepository } from "./patient.repository.js";

@Injectable()
export class PatientsService {
  constructor(@Inject(PatientRepository) private readonly patientRepository: PatientRepository) {}

  async getChart(principal: AuthPrincipal, patientId: string) {
    const tenantId = tenantScopeFromPrincipal(principal).tenantId;
    const patient = await this.patientRepository.findByIdWithinTenant(patientId, tenantId);
    if (!patient) {
      throw new NotFoundException("Patient not found");
    }

    assertTenantScope(principal, patient.tenantId);
    return patient;
  }
}
