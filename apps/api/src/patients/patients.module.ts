import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { PatientRepository } from "./patient.repository.js";
import { PatientsController } from "./patients.controller.js";
import { PatientsService } from "./patients.service.js";

@Module({
  imports: [AuthModule],
  controllers: [PatientsController],
  providers: [PatientsService, PatientRepository]
})
export class PatientsModule {}
