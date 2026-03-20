import { Controller, Get, HttpStatus, Inject, Res } from "@nestjs/common";
import type { Response } from "express";

import { Public } from "../auth/decorators/public.decorator.js";
import { OpsService } from "./ops.service.js";

@Controller("health")
@Public()
export class HealthController {
  constructor(@Inject(OpsService) private readonly opsService: OpsService) {}

  @Get("live")
  getLiveness() {
    return this.opsService.getLiveness();
  }

  @Get("ready")
  async getReadiness(@Res() response: Response): Promise<void> {
    const readiness = await this.opsService.getReadiness();
    response
      .status(readiness.status === "ready" ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE)
      .json(readiness);
  }
}
