import { BadRequestException, ForbiddenException, Inject, Injectable } from "@nestjs/common";

import type { AuthPrincipal } from "@lia/shared-types";
import { USER_ROLE } from "../common/constants/user-role.js";
import { CLINICAL_TIMELINE_VISIBILITY_SCOPE } from "../clinical/clinical.types.js";
import { ClinicalRepository } from "../clinical/clinical.repository.js";
import { EXAM_LIST_VISIBILITY_SCOPE } from "../exams/exams.types.js";
import { ExamsRepository } from "../exams/exams.repository.js";
import { APPOINTMENT_STATUS, type Appointment } from "../scheduling/scheduling.types.js";
import { SchedulingRepository } from "../scheduling/scheduling.repository.js";
import type { PatientPortalOverviewResponse } from "./patient-portal.contracts.js";
import type { PatientPortalSharedNote } from "./patient-portal.types.js";

@Injectable()
export class PatientPortalService {
  constructor(
    @Inject(SchedulingRepository) private readonly schedulingRepository: SchedulingRepository,
    @Inject(ExamsRepository) private readonly examsRepository: ExamsRepository,
    @Inject(ClinicalRepository) private readonly clinicalRepository: ClinicalRepository
  ) {}

  async getOverview(principal: AuthPrincipal, patientId: string): Promise<PatientPortalOverviewResponse> {
    const normalizedPatientId = normalizePatientId(patientId);
    assertPortalPatientAccess(principal, normalizedPatientId);

    const [appointments, releasedExams, sharedTimeline] = await Promise.all([
      this.schedulingRepository.listAppointmentsForPatient(principal.tenantId, normalizedPatientId),
      this.examsRepository.listPatientExams(
        principal.tenantId,
        normalizedPatientId,
        EXAM_LIST_VISIBILITY_SCOPE.PATIENT_VISIBLE
      ),
      this.clinicalRepository.listPatientTimeline(
        principal.tenantId,
        normalizedPatientId,
        CLINICAL_TIMELINE_VISIBILITY_SCOPE.PATIENT_SHARED
      )
    ]);

    const now = Date.now();
    const { upcoming, history } = partitionAppointments(appointments, now);
    const sharedNotes: PatientPortalSharedNote[] = sharedTimeline.map((entry) => ({
      encounterId: entry.encounter.id,
      note: entry.note,
      encounterStartedAtIso: entry.encounter.startedAtIso
    }));

    return {
      overview: {
        patientId: normalizedPatientId,
        appointments: {
          upcoming,
          history
        },
        releasedExams,
        sharedNotes
      }
    };
  }
}

function normalizePatientId(value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new BadRequestException("patientId is required");
  }

  return normalized;
}

function assertPortalPatientAccess(principal: AuthPrincipal, patientId: string): void {
  if (principal.role === USER_ROLE.PATIENT && principal.id !== patientId) {
    throw new ForbiddenException("Patient can only access own portal data");
  }
}

function partitionAppointments(
  appointments: Appointment[],
  nowMs: number
): { upcoming: Appointment[]; history: Appointment[] } {
  const upcoming: Appointment[] = [];
  const history: Appointment[] = [];

  for (const appointment of appointments) {
    if (isUpcoming(appointment, nowMs)) {
      upcoming.push(appointment);
    } else {
      history.push(appointment);
    }
  }

  upcoming.sort((a, b) => new Date(a.startAtIso).getTime() - new Date(b.startAtIso).getTime());
  history.sort((a, b) => new Date(b.startAtIso).getTime() - new Date(a.startAtIso).getTime());

  return { upcoming, history };
}

function isUpcoming(appointment: Appointment, nowMs: number): boolean {
  if (appointment.status !== APPOINTMENT_STATUS.SCHEDULED) {
    return false;
  }

  const endMs = new Date(appointment.endAtIso).getTime();
  return endMs >= nowMs;
}
