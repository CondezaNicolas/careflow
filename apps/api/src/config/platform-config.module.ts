import { Global, Module } from "@nestjs/common";

import { PlatformConfigService } from "./platform-config.service.js";

@Global()
@Module({
  providers: [PlatformConfigService],
  exports: [PlatformConfigService]
})
export class PlatformConfigModule {}
