import { Inject, Injectable, NotFoundException } from "@nestjs/common";

import type { AuthPrincipal } from "@lia/shared-types";

import { assertTenantScope, tenantScopeFromPrincipal } from "../common/tenant/tenant-scope.js";
import { PatientRepository } from "./patient.repository.js";

@Injectable()
export class PatientsService {
  constructor(@Inject(PatientRepository) private readonly patientRepository: PatientRepository) {}

  getChart(principal: AuthPrincipal, patientId: string) {
    const scope = tenantScopeFromPrincipal(principal);
    const patient = this.patientRepository.findByIdWithinTenant(patientId, scope);
    if (!patient) {
      throw new NotFoundException("Patient not found");
    }

    assertTenantScope(principal, patient.tenantId);
    return patient;
  }
}
