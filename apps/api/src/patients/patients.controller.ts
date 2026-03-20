import { Controller, Get, Inject, Param, Req } from "@nestjs/common";

import { Roles } from "../auth/decorators/roles.decorator.js";
import type { RequestWithPrincipal } from "../auth/guards/authenticated.guard.js";
import { USER_ROLE } from "../common/constants/user-role.js";
import { PatientChartParamDto } from "./patients.dtos.js";
import { PatientsService } from "./patients.service.js";

@Controller("patients")
export class PatientsController {
  constructor(@Inject(PatientsService) private readonly patientsService: PatientsService) {}

  @Get(":id/chart")
  @Roles(USER_ROLE.ADMIN, USER_ROLE.CLINICIAN, USER_ROLE.RECEPTIONIST)
  getChart(@Req() request: RequestWithPrincipal, @Param() params: PatientChartParamDto) {
    return this.patientsService.getChart(request.principal!, params.id);
  }
}
