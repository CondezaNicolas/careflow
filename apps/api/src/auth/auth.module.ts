import { Module } from "@nestjs/common";

import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { OidcClient } from "./oidc.client.js";
import { SessionStore } from "./session.store.js";

@Module({
  controllers: [AuthController],
  providers: [AuthService, OidcClient, SessionStore],
  exports: [SessionStore]
})
export class AuthModule {}
