import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { SchedulingController } from "./scheduling.controller.js";
import { SchedulingRepository } from "./scheduling.repository.js";
import { SchedulingService } from "./scheduling.service.js";

@Module({
  imports: [AuthModule],
  controllers: [SchedulingController],
  providers: [SchedulingRepository, SchedulingService],
  exports: [SchedulingService]
})
export class SchedulingModule {}
