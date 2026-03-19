import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { HealthController } from "./health.controller.js";
import { OpsController } from "./ops.controller.js";
import { OpsService } from "./ops.service.js";

@Module({
  imports: [AuthModule],
  controllers: [OpsController, HealthController],
  providers: [OpsService]
})
export class OpsModule {}
