import { Controller, Get, Inject, UseGuards } from "@nestjs/common";

import { Roles } from "../auth/decorators/roles.decorator.js";
import { AuthenticatedGuard } from "../auth/guards/authenticated.guard.js";
import { RolesGuard } from "../auth/guards/roles.guard.js";
import { USER_ROLE } from "../common/constants/user-role.js";
import { OpsService } from "./ops.service.js";

@Controller("ops")
@UseGuards(AuthenticatedGuard, RolesGuard)
@Roles(USER_ROLE.ADMIN)
export class OpsController {
  constructor(@Inject(OpsService) private readonly opsService: OpsService) {}

  @Get("outbox/health")
  getOutboxHealth() {
    return this.opsService.getOutboxHealth();
  }

  @Get("metrics")
  getMetrics() {
    return this.opsService.getApiMetrics();
  }

  @Get("diagnostics")
  getDiagnostics() {
    return this.opsService.getReleaseDiagnostics();
  }
}
