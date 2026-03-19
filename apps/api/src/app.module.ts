import { Module } from "@nestjs/common";

import { AssistantModule } from "./assistant/assistant.module.js";
import { AuditModule } from "./audit/audit.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { ClinicalModule } from "./clinical/clinical.module.js";
import { DatabaseModule } from "./db/database.module.js";
import { ExamsModule } from "./exams/exams.module.js";
import { OpsModule } from "./ops/ops.module.js";
import { PatientPortalModule } from "./patient-portal/patient-portal.module.js";
import { PatientsModule } from "./patients/patients.module.js";
import { SchedulingModule } from "./scheduling/scheduling.module.js";

@Module({
  imports: [
    DatabaseModule,
    AuditModule,
    AuthModule,
    PatientsModule,
    SchedulingModule,
    ClinicalModule,
    ExamsModule,
    PatientPortalModule,
    AssistantModule,
    OpsModule
  ]
})
export class AppModule {}
