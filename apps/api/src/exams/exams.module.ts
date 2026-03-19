import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { ExamsController } from "./exams.controller.js";
import { ExamsRepository } from "./exams.repository.js";
import { ExamsService } from "./exams.service.js";

@Module({
  imports: [AuthModule],
  controllers: [ExamsController],
  providers: [ExamsService, ExamsRepository],
  exports: [ExamsService]
})
export class ExamsModule {}
