import { Controller, Get, Inject } from "@nestjs/common";
import type { AuthPrincipal } from "@lia/shared-types";

import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import { Roles } from "../auth/decorators/roles.decorator.js";
import { USER_ROLE } from "../common/constants/user-role.js";
import { OpsService } from "./ops.service.js";

@Controller("ops")
@Roles(USER_ROLE.ADMIN)
export class OpsController {
  constructor(@Inject(OpsService) private readonly opsService: OpsService) {}

  @Get("outbox/health")
  getOutboxHealth(@CurrentUser() principal: AuthPrincipal) {
    return this.opsService.getOutboxHealth(principal);
  }

  @Get("metrics")
  getMetrics(@CurrentUser() principal: AuthPrincipal) {
    return this.opsService.getApiMetrics(principal);
  }

  @Get("diagnostics")
  getDiagnostics(@CurrentUser() principal: AuthPrincipal) {
    return this.opsService.getReleaseDiagnostics(principal);
  }
}
