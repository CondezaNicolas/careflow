import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";

import { Roles } from "../auth/decorators/roles.decorator.js";
import { AuthenticatedGuard, type RequestWithPrincipal } from "../auth/guards/authenticated.guard.js";
import { AUDIT_SOURCE } from "../audit/audit.types.js";
import { RolesGuard } from "../auth/guards/roles.guard.js";
import { USER_ROLE } from "../common/constants/user-role.js";
import type {
  CreateExamRequest,
  ListPatientExamsQuery,
  TransitionExamStatusRequest,
  UpdateExamRequest
} from "./exams.contracts.js";
import { ExamsService } from "./exams.service.js";
import { EXAM_LIST_VISIBILITY_SCOPE } from "./exams.types.js";

@Controller("exams")
@UseGuards(AuthenticatedGuard, RolesGuard)
export class ExamsController {
  constructor(@Inject(ExamsService) private readonly examsService: ExamsService) {}

  @Post()
  @Roles(USER_ROLE.ADMIN, USER_ROLE.CLINICIAN, USER_ROLE.RECEPTIONIST)
  createExam(@Req() request: RequestWithPrincipal, @Body() body: CreateExamRequest) {
    return this.examsService.createExam(request.principal!, body, {
      source: AUDIT_SOURCE.API,
      requestId: request.context?.requestId,
      traceId: request.context?.traceId
    });
  }

  @Patch(":examId")
  @Roles(USER_ROLE.ADMIN, USER_ROLE.CLINICIAN, USER_ROLE.RECEPTIONIST)
  updateExam(@Req() request: RequestWithPrincipal, @Param("examId") examId: string, @Body() body: UpdateExamRequest) {
    return this.examsService.updateExam(request.principal!, examId, body, {
      source: AUDIT_SOURCE.API,
      requestId: request.context?.requestId,
      traceId: request.context?.traceId
    });
  }

  @Post(":examId/status")
  @HttpCode(200)
  @Roles(USER_ROLE.ADMIN, USER_ROLE.CLINICIAN, USER_ROLE.RECEPTIONIST)
  transitionExamStatus(
    @Req() request: RequestWithPrincipal,
    @Param("examId") examId: string,
    @Body() body: TransitionExamStatusRequest
  ) {
    return this.examsService.transitionExamStatus(request.principal!, examId, body, {
      source: AUDIT_SOURCE.API,
      requestId: request.context?.requestId,
      traceId: request.context?.traceId
    });
  }

  @Get("patients/:patientId")
  @Roles(USER_ROLE.ADMIN, USER_ROLE.CLINICIAN, USER_ROLE.RECEPTIONIST)
  listPatientExams(
    @Req() request: RequestWithPrincipal,
    @Param("patientId") patientId: string,
    @Query("visibility") visibility = EXAM_LIST_VISIBILITY_SCOPE.ALL
  ) {
    const query: ListPatientExamsQuery = {
      visibilityScope: visibility
    };

    return this.examsService.listPatientExams(request.principal!, patientId, query);
  }
}
