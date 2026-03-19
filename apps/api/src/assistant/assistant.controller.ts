import { Body, Controller, Inject, Param, Post, Req, UseGuards } from "@nestjs/common";

import { AUDIT_SOURCE } from "../audit/audit.types.js";
import { Roles } from "../auth/decorators/roles.decorator.js";
import { AuthenticatedGuard, type RequestWithPrincipal } from "../auth/guards/authenticated.guard.js";
import { RolesGuard } from "../auth/guards/roles.guard.js";
import { USER_ROLE } from "../common/constants/user-role.js";
import type { AssistantInvokeToolRequest } from "./assistant.contracts.js";
import { AssistantService } from "./assistant.service.js";

@Controller("lia-assistant")
@UseGuards(AuthenticatedGuard, RolesGuard)
@Roles(USER_ROLE.ADMIN, USER_ROLE.CLINICIAN, USER_ROLE.RECEPTIONIST, USER_ROLE.PATIENT)
export class AssistantController {
  constructor(@Inject(AssistantService) private readonly assistantService: AssistantService) {}

  @Post("tools/:toolName/invoke")
  invokeTool(
    @Req() request: RequestWithPrincipal,
    @Param("toolName") toolName: string,
    @Body() body: AssistantInvokeToolRequest
  ) {
    return this.assistantService.invokeTool(request.principal!, toolName, body, {
      source: AUDIT_SOURCE.ASSISTANT,
      requestId: request.context?.requestId,
      traceId: request.context?.traceId
    });
  }
}
