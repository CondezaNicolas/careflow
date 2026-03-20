import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req
} from "@nestjs/common";

import { Roles } from "../auth/decorators/roles.decorator.js";
import type { RequestWithPrincipal } from "../auth/guards/authenticated.guard.js";
import { AUDIT_SOURCE } from "../audit/audit.types.js";
import { USER_ROLE } from "../common/constants/user-role.js";
import type {
  CreateExamRequest,
  TransitionExamStatusRequest,
  UpdateExamRequest
} from "./exams.contracts.js";
import {
  CreateExamRequestDto,
  ExamAttachmentMetadataDto,
  ExamIdParamDto,
  ListPatientExamsQueryDto,
  PatientIdParamDto,
  TransitionExamStatusRequestDto,
  UpdateExamRequestDto
} from "./exams.dtos.js";
import { ExamsService } from "./exams.service.js";

@Controller("exams")
export class ExamsController {
  constructor(@Inject(ExamsService) private readonly examsService: ExamsService) {}

  @Post()
  @Roles(USER_ROLE.ADMIN, USER_ROLE.CLINICIAN, USER_ROLE.RECEPTIONIST)
  createExam(@Req() request: RequestWithPrincipal, @Body() body: CreateExamRequestDto) {
    return this.examsService.createExam(request.principal!, toCreateExamRequest(body), {
      source: AUDIT_SOURCE.API,
      requestId: request.context?.requestId,
      traceId: request.context?.traceId
    });
  }

  @Patch(":examId")
  @Roles(USER_ROLE.ADMIN, USER_ROLE.CLINICIAN, USER_ROLE.RECEPTIONIST)
  updateExam(
    @Req() request: RequestWithPrincipal,
    @Param() params: ExamIdParamDto,
    @Body() body: UpdateExamRequestDto
  ) {
    return this.examsService.updateExam(
      request.principal!,
      params.examId,
      toUpdateExamRequest(body),
      {
        source: AUDIT_SOURCE.API,
        requestId: request.context?.requestId,
        traceId: request.context?.traceId
      }
    );
  }

  @Post(":examId/status")
  @HttpCode(200)
  @Roles(USER_ROLE.ADMIN, USER_ROLE.CLINICIAN, USER_ROLE.RECEPTIONIST)
  transitionExamStatus(
    @Req() request: RequestWithPrincipal,
    @Param() params: ExamIdParamDto,
    @Body() body: TransitionExamStatusRequestDto
  ) {
    return this.examsService.transitionExamStatus(
      request.principal!,
      params.examId,
      toTransitionExamStatusRequest(body),
      {
        source: AUDIT_SOURCE.API,
        requestId: request.context?.requestId,
        traceId: request.context?.traceId
      }
    );
  }

  @Get("patients/:patientId")
  @Roles(USER_ROLE.ADMIN, USER_ROLE.CLINICIAN, USER_ROLE.RECEPTIONIST)
  listPatientExams(
    @Req() request: RequestWithPrincipal,
    @Param() params: PatientIdParamDto,
    @Query() query: ListPatientExamsQueryDto
  ) {
    return this.examsService.listPatientExams(request.principal!, params.patientId, {
      visibilityScope: query.visibilityScope
    });
  }
}

function toCreateExamRequest(body: CreateExamRequestDto): CreateExamRequest {
  return {
    patientId: body.patientId,
    examType: body.examType,
    notes: body.notes ?? null,
    attachments: body.attachments.map(toExamAttachmentMetadata)
  };
}

function toUpdateExamRequest(body: UpdateExamRequestDto): UpdateExamRequest {
  return {
    examType: body.examType,
    notes: body.notes ?? null,
    attachments: body.attachments.map(toExamAttachmentMetadata)
  };
}

function toTransitionExamStatusRequest(
  body: TransitionExamStatusRequestDto
): TransitionExamStatusRequest {
  return {
    toStatus: body.toStatus
  };
}

function toExamAttachmentMetadata(body: ExamAttachmentMetadataDto) {
  return {
    attachmentId: body.attachmentId,
    fileName: body.fileName,
    mimeType: body.mimeType,
    sizeBytes: body.sizeBytes
  };
}
