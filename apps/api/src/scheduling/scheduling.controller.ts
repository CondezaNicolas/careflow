import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UseGuards
} from "@nestjs/common";

import { Roles } from "../auth/decorators/roles.decorator.js";
import { AuthenticatedGuard, type RequestWithPrincipal } from "../auth/guards/authenticated.guard.js";
import { RolesGuard } from "../auth/guards/roles.guard.js";
import { USER_ROLE } from "../common/constants/user-role.js";
import { AUDIT_SOURCE } from "../audit/audit.types.js";
import type {
  CreateAppointmentRequest,
  CreateAvailabilityWindowRequest,
  RescheduleAppointmentRequest,
  SearchAvailabilityQuery
} from "./scheduling.contracts.js";
import { SchedulingService } from "./scheduling.service.js";

@Controller("scheduling")
@UseGuards(AuthenticatedGuard, RolesGuard)
export class SchedulingController {
  constructor(@Inject(SchedulingService) private readonly schedulingService: SchedulingService) {}

  @Get("availability")
  @Roles(USER_ROLE.ADMIN, USER_ROLE.CLINICIAN, USER_ROLE.RECEPTIONIST)
  searchAvailability(
    @Req() request: RequestWithPrincipal,
    @Query("specialistId") specialistId: string,
    @Query("from") fromIso: string,
    @Query("to") toIso: string,
    @Query("durationMinutes") durationMinutes = "30"
  ) {
    const duration = Number.parseInt(durationMinutes, 10);
    const query: SearchAvailabilityQuery = {
      specialistId,
      fromIso,
      toIso,
      durationMinutes: duration
    };
    return this.schedulingService.searchAvailability(request.principal!, query);
  }

  @Post("availability/windows")
  @Roles(USER_ROLE.ADMIN, USER_ROLE.CLINICIAN)
  createAvailabilityWindow(@Req() request: RequestWithPrincipal, @Body() body: CreateAvailabilityWindowRequest) {
    return this.schedulingService.createAvailabilityWindow(request.principal!, body);
  }

  @Post("appointments")
  @Roles(USER_ROLE.ADMIN, USER_ROLE.CLINICIAN, USER_ROLE.RECEPTIONIST)
  createAppointment(
    @Req() request: RequestWithPrincipal,
    @Body() body: CreateAppointmentRequest,
    @Headers("idempotency-key") idempotencyKey: string
  ) {
    return this.schedulingService.createAppointment(request.principal!, body, requireIdempotencyKey(idempotencyKey), {
      source: AUDIT_SOURCE.API,
      requestId: request.context?.requestId,
      traceId: request.context?.traceId
    });
  }

  @Post("appointments/:id/reschedule")
  @Roles(USER_ROLE.ADMIN, USER_ROLE.CLINICIAN, USER_ROLE.RECEPTIONIST)
  rescheduleAppointment(
    @Req() request: RequestWithPrincipal,
    @Param("id") id: string,
    @Body() body: RescheduleAppointmentRequest,
    @Headers("idempotency-key") idempotencyKey: string
  ) {
    return this.schedulingService.rescheduleAppointment(
      request.principal!,
      id,
      body,
      requireIdempotencyKey(idempotencyKey),
      {
        source: AUDIT_SOURCE.API,
        requestId: request.context?.requestId,
        traceId: request.context?.traceId
      }
    );
  }

  @Post("appointments/:id/cancel")
  @Roles(USER_ROLE.ADMIN, USER_ROLE.CLINICIAN, USER_ROLE.RECEPTIONIST)
  cancelAppointment(
    @Req() request: RequestWithPrincipal,
    @Param("id") id: string,
    @Headers("idempotency-key") idempotencyKey: string
  ) {
    return this.schedulingService.cancelAppointment(request.principal!, id, requireIdempotencyKey(idempotencyKey), {
      source: AUDIT_SOURCE.API,
      requestId: request.context?.requestId,
      traceId: request.context?.traceId
    });
  }
}

function requireIdempotencyKey(value: string | undefined): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new BadRequestException("idempotency-key header is required");
  }

  if (normalized.length > 128) {
    throw new BadRequestException("idempotency-key header exceeds 128 characters");
  }

  if (!/^[A-Za-z0-9._:-]+$/.test(normalized)) {
    throw new BadRequestException("idempotency-key header contains invalid characters");
  }

  return normalized;
}
