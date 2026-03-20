import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";

import { AssistantModule } from "./assistant/assistant.module.js";
import { AuditModule } from "./audit/audit.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { PlatformAuthGuard } from "./auth/guards/platform-auth.guard.js";
import { RolesGuard } from "./auth/guards/roles.guard.js";
import { ClinicalModule } from "./clinical/clinical.module.js";
import { PlatformConfigModule } from "./config/platform-config.module.js";
import { DatabaseModule } from "./db/database.module.js";
import { ExamsModule } from "./exams/exams.module.js";
import { OpsModule } from "./ops/ops.module.js";
import { PatientPortalModule } from "./patient-portal/patient-portal.module.js";
import { PatientsModule } from "./patients/patients.module.js";
import { SchedulingModule } from "./scheduling/scheduling.module.js";
import { UsersModule } from "./users/users.module.js";

@Module({
  imports: [
    PlatformConfigModule,
    DatabaseModule,
    AuditModule,
    AuthModule,
    UsersModule,
    PatientsModule,
    SchedulingModule,
    ClinicalModule,
    ExamsModule,
    PatientPortalModule,
    AssistantModule,
    OpsModule
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: PlatformAuthGuard
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard
    }
  ]
})
export class AppModule {}
