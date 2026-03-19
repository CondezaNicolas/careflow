import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { ExamsModule } from "../exams/exams.module.js";
import { SchedulingModule } from "../scheduling/scheduling.module.js";
import { AssistantController } from "./assistant.controller.js";
import { AssistantRepository } from "./assistant.repository.js";
import { AssistantService } from "./assistant.service.js";

@Module({
  imports: [AuthModule, SchedulingModule, ExamsModule],
  controllers: [AssistantController],
  providers: [AssistantRepository, AssistantService]
})
export class AssistantModule {}
