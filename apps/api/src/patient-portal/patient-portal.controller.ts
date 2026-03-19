import { Controller, Get, Inject, Param, Req, UseGuards } from "@nestjs/common";

import { Roles } from "../auth/decorators/roles.decorator.js";
import { AuthenticatedGuard, type RequestWithPrincipal } from "../auth/guards/authenticated.guard.js";
import { RolesGuard } from "../auth/guards/roles.guard.js";
import { USER_ROLE } from "../common/constants/user-role.js";
import { PatientPortalService } from "./patient-portal.service.js";

@Controller("patient-portal")
@UseGuards(AuthenticatedGuard, RolesGuard)
export class PatientPortalController {
  constructor(@Inject(PatientPortalService) private readonly patientPortalService: PatientPortalService) {}

  @Get("me/overview")
  @Roles(USER_ROLE.PATIENT)
  getMyOverview(@Req() request: RequestWithPrincipal) {
    return this.patientPortalService.getOverview(request.principal!, request.principal!.id);
  }

  @Get("patients/:patientId/overview")
  @Roles(USER_ROLE.ADMIN, USER_ROLE.CLINICIAN, USER_ROLE.RECEPTIONIST, USER_ROLE.PATIENT)
  getPatientOverview(@Req() request: RequestWithPrincipal, @Param("patientId") patientId: string) {
    return this.patientPortalService.getOverview(request.principal!, patientId);
  }
}
