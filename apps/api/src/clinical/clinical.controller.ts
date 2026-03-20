import { Body, Controller, Get, Inject, Param, Patch, Post, Query, Req } from "@nestjs/common";

import { Roles } from "../auth/decorators/roles.decorator.js";
import type { RequestWithPrincipal } from "../auth/guards/authenticated.guard.js";
import { USER_ROLE } from "../common/constants/user-role.js";
import type {
  CreateClinicalEncounterRequest,
  CreateClinicalNoteRequest,
  UpdateClinicalEncounterRequest,
  UpdateClinicalNoteRequest
} from "./clinical.contracts.js";
import { ClinicalService } from "./clinical.service.js";
import {
  ClinicalAttachmentMetadataDto,
  ClinicalAntecedentDto,
  ClinicalMedicationDto,
  ClinicalTimelineQueryDto,
  ClinicalVitalsDto,
  CreateClinicalEncounterRequestDto,
  CreateClinicalNoteRequestDto,
  EncounterIdParamDto,
  NoteIdParamDto,
  PatientIdParamDto,
  UpdateClinicalEncounterRequestDto,
  UpdateClinicalNoteRequestDto
} from "./clinical.dtos.js";

@Controller("clinical")
export class ClinicalController {
  constructor(@Inject(ClinicalService) private readonly clinicalService: ClinicalService) {}

  @Post("encounters")
  @Roles(USER_ROLE.ADMIN, USER_ROLE.CLINICIAN, USER_ROLE.RECEPTIONIST)
  createEncounter(
    @Req() request: RequestWithPrincipal,
    @Body() body: CreateClinicalEncounterRequestDto
  ) {
    return this.clinicalService.createEncounter(request.principal!, toCreateEncounterRequest(body));
  }

  @Patch("encounters/:encounterId")
  @Roles(USER_ROLE.ADMIN, USER_ROLE.CLINICIAN, USER_ROLE.RECEPTIONIST)
  updateEncounter(
    @Req() request: RequestWithPrincipal,
    @Param() params: EncounterIdParamDto,
    @Body() body: UpdateClinicalEncounterRequestDto
  ) {
    return this.clinicalService.updateEncounter(
      request.principal!,
      params.encounterId,
      toUpdateEncounterRequest(body)
    );
  }

  @Post("encounters/:encounterId/notes")
  @Roles(USER_ROLE.ADMIN, USER_ROLE.CLINICIAN, USER_ROLE.RECEPTIONIST)
  createEncounterNote(
    @Req() request: RequestWithPrincipal,
    @Param() params: EncounterIdParamDto,
    @Body() body: CreateClinicalNoteRequestDto
  ) {
    return this.clinicalService.createEncounterNote(
      request.principal!,
      params.encounterId,
      toCreateNoteRequest(body)
    );
  }

  @Patch("notes/:noteId")
  @Roles(USER_ROLE.ADMIN, USER_ROLE.CLINICIAN, USER_ROLE.RECEPTIONIST)
  updateNote(
    @Req() request: RequestWithPrincipal,
    @Param() params: NoteIdParamDto,
    @Body() body: UpdateClinicalNoteRequestDto
  ) {
    return this.clinicalService.updateNote(
      request.principal!,
      params.noteId,
      toUpdateNoteRequest(body)
    );
  }

  @Get("patients/:patientId/timeline")
  @Roles(USER_ROLE.ADMIN, USER_ROLE.CLINICIAN, USER_ROLE.RECEPTIONIST)
  getPatientTimeline(
    @Req() request: RequestWithPrincipal,
    @Param() params: PatientIdParamDto,
    @Query() query: ClinicalTimelineQueryDto
  ) {
    return this.clinicalService.getPatientTimeline(request.principal!, params.patientId, {
      visibilityScope: query.visibilityScope,
      limit: query.limit,
      offset: query.offset
    });
  }
}

function toCreateEncounterRequest(
  body: CreateClinicalEncounterRequestDto
): CreateClinicalEncounterRequest {
  return {
    patientId: body.patientId,
    startedAtIso: body.startedAtIso,
    endedAtIso: body.endedAtIso ?? null,
    reason: body.reason ?? null
  };
}

function toUpdateEncounterRequest(
  body: UpdateClinicalEncounterRequestDto
): UpdateClinicalEncounterRequest {
  return {
    startedAtIso: body.startedAtIso,
    endedAtIso: body.endedAtIso ?? null,
    reason: body.reason ?? null
  };
}

function toCreateNoteRequest(body: CreateClinicalNoteRequestDto): CreateClinicalNoteRequest {
  return {
    patientId: body.patientId,
    visibility: body.visibility,
    subjective: body.subjective,
    objective: body.objective,
    assessment: body.assessment,
    plan: body.plan,
    vitals: toClinicalVitals(body.vitals),
    medications: body.medications.map(toClinicalMedication),
    antecedentes: body.antecedentes.map(toClinicalAntecedent),
    attachments: body.attachments.map(toClinicalAttachment)
  };
}

function toUpdateNoteRequest(body: UpdateClinicalNoteRequestDto): UpdateClinicalNoteRequest {
  return {
    visibility: body.visibility,
    subjective: body.subjective,
    objective: body.objective,
    assessment: body.assessment,
    plan: body.plan,
    vitals: toClinicalVitals(body.vitals),
    medications: body.medications.map(toClinicalMedication),
    antecedentes: body.antecedentes.map(toClinicalAntecedent),
    attachments: body.attachments.map(toClinicalAttachment)
  };
}

function toClinicalVitals(body: ClinicalVitalsDto) {
  return {
    systolicBpMmHg: body.systolicBpMmHg ?? null,
    diastolicBpMmHg: body.diastolicBpMmHg ?? null,
    heartRateBpm: body.heartRateBpm ?? null,
    respiratoryRateBpm: body.respiratoryRateBpm ?? null,
    oxygenSaturationPct: body.oxygenSaturationPct ?? null,
    temperatureC: body.temperatureC ?? null,
    weightKg: body.weightKg ?? null,
    heightCm: body.heightCm ?? null
  };
}

function toClinicalMedication(body: ClinicalMedicationDto) {
  return {
    name: body.name,
    dose: body.dose,
    frequency: body.frequency,
    route: body.route,
    instructions: body.instructions ?? ""
  };
}

function toClinicalAntecedent(body: ClinicalAntecedentDto) {
  return {
    category: body.category,
    description: body.description
  };
}

function toClinicalAttachment(body: ClinicalAttachmentMetadataDto) {
  return {
    attachmentId: body.attachmentId,
    fileName: body.fileName,
    mimeType: body.mimeType,
    sizeBytes: body.sizeBytes
  };
}
