import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { ClinicalRepository } from "../clinical/clinical.repository.js";
import { ExamsRepository } from "../exams/exams.repository.js";
import { SchedulingRepository } from "../scheduling/scheduling.repository.js";
import { PatientPortalController } from "./patient-portal.controller.js";
import { PatientPortalService } from "./patient-portal.service.js";

@Module({
  imports: [AuthModule],
  controllers: [PatientPortalController],
  providers: [PatientPortalService, SchedulingRepository, ExamsRepository, ClinicalRepository]
})
export class PatientPortalModule {}
