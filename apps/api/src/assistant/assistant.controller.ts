import { Body, Controller, Inject, Param, Post, Req } from "@nestjs/common";

import { AUDIT_SOURCE } from "../audit/audit.types.js";
import { Roles } from "../auth/decorators/roles.decorator.js";
import type { RequestWithPrincipal } from "../auth/guards/authenticated.guard.js";
import { USER_ROLE } from "../common/constants/user-role.js";
import type { AssistantInvokeToolRequest } from "./assistant.contracts.js";
import { AssistantInvokeToolRequestDto, AssistantToolParamDto } from "./assistant.dtos.js";
import { AssistantService } from "./assistant.service.js";

@Controller("lia-assistant")
@Roles(USER_ROLE.ADMIN, USER_ROLE.CLINICIAN, USER_ROLE.RECEPTIONIST, USER_ROLE.PATIENT)
export class AssistantController {
  constructor(@Inject(AssistantService) private readonly assistantService: AssistantService) {}

  @Post("tools/:toolName/invoke")
  invokeTool(
    @Req() request: RequestWithPrincipal,
    @Param() params: AssistantToolParamDto,
    @Body() body: AssistantInvokeToolRequestDto
  ) {
    return this.assistantService.invokeTool(
      request.principal!,
      params.toolName,
      toInvokeToolRequest(body),
      {
        source: AUDIT_SOURCE.ASSISTANT,
        requestId: request.context?.requestId,
        traceId: request.context?.traceId
      }
    );
  }
}

function toInvokeToolRequest(body: AssistantInvokeToolRequestDto): AssistantInvokeToolRequest {
  return {
    input: body.input,
    confirmation: body.confirmation
      ? {
          confirmed: body.confirmation.confirmed,
          token: body.confirmation.token ?? null,
          reason: body.confirmation.reason ?? null
        }
      : undefined
  };
}
