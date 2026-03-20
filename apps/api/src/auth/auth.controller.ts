import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Query,
  Res,
  HttpCode,
  HttpStatus
} from "@nestjs/common";
import type { AuthPrincipal } from "@lia/shared-types";
import type { Response } from "express";

import { AuthService } from "./auth.service.js";
import { DevLoginQueryDto, LoginDto, RegisterDto, RefreshDto } from "./dtos/index.js";
import { CurrentUser } from "./decorators/current-user.decorator.js";
import { Public } from "./decorators/public.decorator.js";
import { Roles } from "./decorators/roles.decorator.js";
import { USER_ROLE } from "../common/constants/user-role.js";
import { PlatformConfigService } from "../config/platform-config.service.js";

const AUTHENTICATED_USER_ROLE = [
  USER_ROLE.ADMIN,
  USER_ROLE.CLINICIAN,
  USER_ROLE.RECEPTIONIST,
  USER_ROLE.PATIENT
] as const;

@Controller("auth")
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(PlatformConfigService) private readonly platformConfig: PlatformConfigService
  ) {}

  @Public()
  @Post("register")
  async register(@Body() dto: RegisterDto) {
    const result = await this.authService.register(dto);
    return { success: true, userId: result.userId };
  }

  @Public()
  @Post("login")
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.authService.login(dto);

    res.cookie(
      this.platformConfig.cookies.sessionCookieName,
      tokens.accessToken,
      this.platformConfig.createAccessTokenCookieOptions(tokens.expiresIn)
    );

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn
    };
  }

  @Public()
  @Post("refresh")
  async refresh(@Body() dto: RefreshDto, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.authService.refresh(dto.refreshToken);

    res.cookie(
      this.platformConfig.cookies.sessionCookieName,
      tokens.accessToken,
      this.platformConfig.createAccessTokenCookieOptions(tokens.expiresIn)
    );

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn
    };
  }

  @Post("logout")
  @HttpCode(HttpStatus.OK)
  @Roles(...AUTHENTICATED_USER_ROLE)
  async logout(
    @CurrentUser() principal: AuthPrincipal,
    @Body() dto: RefreshDto,
    @Res({ passthrough: true }) res: Response
  ) {
    await this.authService.logout(principal, dto.refreshToken);
    res.clearCookie(
      this.platformConfig.cookies.sessionCookieName,
      this.platformConfig.createClearSessionCookieOptions()
    );
    return { success: true };
  }

  // Keep dev-login for convenience
  @Public()
  @Get("dev-login")
  async devLogin(@Query() query: DevLoginQueryDto, @Res({ passthrough: true }) res: Response) {
    const role = query.role ?? USER_ROLE.ADMIN;
    const tokens = await this.authService.loginAsDevRole(role);

    res.cookie(
      this.platformConfig.cookies.sessionCookieName,
      tokens.accessToken,
      this.platformConfig.createAccessTokenCookieOptions(tokens.expiresIn)
    );

    return {
      success: true,
      role,
      redirectUrl: query.redirect,
      accessToken: tokens.accessToken
    };
  }
}
