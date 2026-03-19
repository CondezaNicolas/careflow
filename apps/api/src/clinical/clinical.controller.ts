import { Body, Controller, Get, Inject, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";

import { Roles } from "../auth/decorators/roles.decorator.js";
import { AuthenticatedGuard, type RequestWithPrincipal } from "../auth/guards/authenticated.guard.js";
import { RolesGuard } from "../auth/guards/roles.guard.js";
import { USER_ROLE } from "../common/constants/user-role.js";
import type {
  ClinicalTimelineQuery,
  CreateClinicalEncounterRequest,
  CreateClinicalNoteRequest,
  UpdateClinicalEncounterRequest,
  UpdateClinicalNoteRequest
} from "./clinical.contracts.js";
import { ClinicalService } from "./clinical.service.js";
import { CLINICAL_TIMELINE_VISIBILITY_SCOPE, type ClinicalTimelineVisibilityScope } from "./clinical.types.js";

@Controller("clinical")
@UseGuards(AuthenticatedGuard, RolesGuard)
export class ClinicalController {
  constructor(@Inject(ClinicalService) private readonly clinicalService: ClinicalService) {}

  @Post("encounters")
  @Roles(USER_ROLE.ADMIN, USER_ROLE.CLINICIAN, USER_ROLE.RECEPTIONIST)
  createEncounter(@Req() request: RequestWithPrincipal, @Body() body: CreateClinicalEncounterRequest) {
    return this.clinicalService.createEncounter(request.principal!, body);
  }

  @Patch("encounters/:encounterId")
  @Roles(USER_ROLE.ADMIN, USER_ROLE.CLINICIAN, USER_ROLE.RECEPTIONIST)
  updateEncounter(
    @Req() request: RequestWithPrincipal,
    @Param("encounterId") encounterId: string,
    @Body() body: UpdateClinicalEncounterRequest
  ) {
    return this.clinicalService.updateEncounter(request.principal!, encounterId, body);
  }

  @Post("encounters/:encounterId/notes")
  @Roles(USER_ROLE.ADMIN, USER_ROLE.CLINICIAN, USER_ROLE.RECEPTIONIST)
  createEncounterNote(
    @Req() request: RequestWithPrincipal,
    @Param("encounterId") encounterId: string,
    @Body() body: CreateClinicalNoteRequest
  ) {
    return this.clinicalService.createEncounterNote(request.principal!, encounterId, body);
  }

  @Patch("notes/:noteId")
  @Roles(USER_ROLE.ADMIN, USER_ROLE.CLINICIAN, USER_ROLE.RECEPTIONIST)
  updateNote(@Req() request: RequestWithPrincipal, @Param("noteId") noteId: string, @Body() body: UpdateClinicalNoteRequest) {
    return this.clinicalService.updateNote(request.principal!, noteId, body);
  }

  @Get("patients/:patientId/timeline")
  @Roles(USER_ROLE.ADMIN, USER_ROLE.CLINICIAN, USER_ROLE.RECEPTIONIST)
  getPatientTimeline(
    @Req() request: RequestWithPrincipal,
    @Param("patientId") patientId: string,
    @Query("visibility") visibility = CLINICAL_TIMELINE_VISIBILITY_SCOPE.ALL
  ) {
    const query: ClinicalTimelineQuery = {
      visibilityScope: normalizeVisibilityScope(visibility)
    };
    return this.clinicalService.getPatientTimeline(request.principal!, patientId, query);
  }
}

function normalizeVisibilityScope(value: string): ClinicalTimelineVisibilityScope {
  if (
    value === CLINICAL_TIMELINE_VISIBILITY_SCOPE.ALL ||
    value === CLINICAL_TIMELINE_VISIBILITY_SCOPE.INTERNAL ||
    value === CLINICAL_TIMELINE_VISIBILITY_SCOPE.PATIENT_SHARED
  ) {
    return value;
  }

  return CLINICAL_TIMELINE_VISIBILITY_SCOPE.ALL;
}
