import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";

import { PlatformConfigModule } from "../config/platform-config.module.js";
import { PlatformConfigService } from "../config/platform-config.service.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { PlatformAuthGuard } from "./guards/platform-auth.guard.js";
import { RolesGuard } from "./guards/roles.guard.js";
import { JwtStrategy } from "./jwt/jwt.strategy.js";
import { JwtRefreshStrategy } from "./jwt/jwt-refresh.strategy.js";
import { JwtAuthGuard } from "./jwt/jwt-auth.guard.js";
import { JwtRefreshGuard } from "./jwt/jwt-refresh.guard.js";
import { UsersModule } from "../users/users.module.js";

@Module({
  imports: [
    PlatformConfigModule,
    PassportModule.register({ defaultStrategy: "jwt" }),
    JwtModule.registerAsync({
      imports: [PlatformConfigModule],
      inject: [PlatformConfigService],
      useFactory: (platformConfig: PlatformConfigService) => ({
        secret: platformConfig.auth.jwtSecret,
        signOptions: { expiresIn: platformConfig.auth.accessTokenTtlSeconds }
      })
    }),
    UsersModule
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    JwtRefreshStrategy,
    JwtAuthGuard,
    JwtRefreshGuard,
    PlatformAuthGuard,
    RolesGuard
  ],
  exports: [AuthService, JwtAuthGuard, JwtRefreshGuard, PlatformAuthGuard, RolesGuard]
})
export class AuthModule {}
