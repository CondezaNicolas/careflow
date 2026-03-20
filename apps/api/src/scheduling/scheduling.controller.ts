import {
  type ArgumentMetadata,
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Query,
  Req
} from "@nestjs/common";

import { Roles } from "../auth/decorators/roles.decorator.js";
import type { RequestWithPrincipal } from "../auth/guards/authenticated.guard.js";
import { USER_ROLE } from "../common/constants/user-role.js";
import { AUDIT_SOURCE } from "../audit/audit.types.js";
import { IdempotencyKeyPipe } from "../common/validation/idempotency-key.pipe.js";
import type {
  CreateAppointmentRequest,
  CreateAvailabilityWindowRequest,
  RescheduleAppointmentRequest,
  SearchAvailabilityQuery
} from "./scheduling.contracts.js";
import {
  AppointmentIdParamDto,
  CreateAppointmentRequestDto,
  CreateAvailabilityWindowRequestDto,
  RescheduleAppointmentRequestDto,
  SearchAvailabilityQueryDto
} from "./scheduling.dtos.js";
import { SchedulingService } from "./scheduling.service.js";

@Controller("scheduling")
export class SchedulingController {
  constructor(@Inject(SchedulingService) private readonly schedulingService: SchedulingService) {}

  @Get("availability")
  @Roles(USER_ROLE.ADMIN, USER_ROLE.CLINICIAN, USER_ROLE.RECEPTIONIST)
  searchAvailability(
    @Req() request: RequestWithPrincipal,
    @Query() query: SearchAvailabilityQueryDto
  ) {
    return this.schedulingService.searchAvailability(
      request.principal!,
      toSearchAvailabilityQuery(query)
    );
  }

  @Post("availability/windows")
  @Roles(USER_ROLE.ADMIN, USER_ROLE.CLINICIAN)
  createAvailabilityWindow(
    @Req() request: RequestWithPrincipal,
    @Body() body: CreateAvailabilityWindowRequestDto
  ) {
    return this.schedulingService.createAvailabilityWindow(
      request.principal!,
      toCreateAvailabilityWindowRequest(body)
    );
  }

  @Post("appointments")
  @Roles(USER_ROLE.ADMIN, USER_ROLE.CLINICIAN, USER_ROLE.RECEPTIONIST)
  createAppointment(
    @Req() request: RequestWithPrincipal,
    @Body() body: CreateAppointmentRequestDto,
    @Headers("idempotency-key") idempotencyKey: string
  ) {
    return this.schedulingService.createAppointment(
      request.principal!,
      toCreateAppointmentRequest(body),
      validateIdempotencyKey(idempotencyKey),
      {
        source: AUDIT_SOURCE.API,
        requestId: request.context?.requestId,
        traceId: request.context?.traceId
      }
    );
  }

  @Post("appointments/:id/reschedule")
  @Roles(USER_ROLE.ADMIN, USER_ROLE.CLINICIAN, USER_ROLE.RECEPTIONIST)
  rescheduleAppointment(
    @Req() request: RequestWithPrincipal,
    @Param() params: AppointmentIdParamDto,
    @Body() body: RescheduleAppointmentRequestDto,
    @Headers("idempotency-key") idempotencyKey: string
  ) {
    return this.schedulingService.rescheduleAppointment(
      request.principal!,
      params.id,
      toRescheduleAppointmentRequest(body),
      validateIdempotencyKey(idempotencyKey),
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
    @Param() params: AppointmentIdParamDto,
    @Headers("idempotency-key") idempotencyKey: string
  ) {
    return this.schedulingService.cancelAppointment(
      request.principal!,
      params.id,
      validateIdempotencyKey(idempotencyKey),
      {
        source: AUDIT_SOURCE.API,
        requestId: request.context?.requestId,
        traceId: request.context?.traceId
      }
    );
  }
}

const IDEMPOTENCY_KEY_PIPE = new IdempotencyKeyPipe();
const HEADER_ARGUMENT_METADATA: ArgumentMetadata = {
  type: "custom",
  data: "idempotency-key",
  metatype: String
};

function validateIdempotencyKey(value: string | undefined): string {
  return IDEMPOTENCY_KEY_PIPE.transform(value, HEADER_ARGUMENT_METADATA);
}

function toSearchAvailabilityQuery(query: SearchAvailabilityQueryDto): SearchAvailabilityQuery {
  return {
    specialistId: query.specialistId,
    fromIso: query.from,
    toIso: query.to,
    durationMinutes: query.durationMinutes
  };
}

function toCreateAvailabilityWindowRequest(
  body: CreateAvailabilityWindowRequestDto
): CreateAvailabilityWindowRequest {
  return {
    specialistId: body.specialistId,
    startAtIso: body.startAtIso,
    endAtIso: body.endAtIso
  };
}

function toCreateAppointmentRequest(body: CreateAppointmentRequestDto): CreateAppointmentRequest {
  return {
    patientId: body.patientId,
    specialistId: body.specialistId,
    startAtIso: body.startAtIso,
    endAtIso: body.endAtIso
  };
}

function toRescheduleAppointmentRequest(
  body: RescheduleAppointmentRequestDto
): RescheduleAppointmentRequest {
  return {
    specialistId: body.specialistId,
    startAtIso: body.startAtIso,
    endAtIso: body.endAtIso
  };
}
