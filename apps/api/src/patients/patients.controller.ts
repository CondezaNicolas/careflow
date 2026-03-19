import { Controller, Get, Inject, Param, Req, UseGuards } from "@nestjs/common";

import { Roles } from "../auth/decorators/roles.decorator.js";
import { AuthenticatedGuard, type RequestWithPrincipal } from "../auth/guards/authenticated.guard.js";
import { RolesGuard } from "../auth/guards/roles.guard.js";
import { USER_ROLE } from "../common/constants/user-role.js";
import { PatientsService } from "./patients.service.js";

@Controller("patients")
@UseGuards(AuthenticatedGuard, RolesGuard)
export class PatientsController {
  constructor(@Inject(PatientsService) private readonly patientsService: PatientsService) {}

  @Get(":id/chart")
  @Roles(USER_ROLE.ADMIN, USER_ROLE.CLINICIAN, USER_ROLE.RECEPTIONIST)
  getChart(@Req() request: RequestWithPrincipal, @Param("id") id: string) {
    return this.patientsService.getChart(request.principal!, id);
  }
}
