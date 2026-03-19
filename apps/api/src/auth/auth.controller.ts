import { BadRequestException, Controller, Get, Inject, Query, Res } from "@nestjs/common";
import type { Response } from "express";

import { AuthService } from "./auth.service.js";

@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Get("callback")
  async callback(@Query("code") code: string, @Res({ passthrough: true }) response: Response) {
    if (!code) {
      throw new BadRequestException("Missing authorization code");
    }

    const session = await this.authService.issueSessionFromOidcCode(code);

    // Set session ID cookie
    response.cookie("lia_session", session.sessionId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      expires: new Date(session.expiresAtIso),
      path: "/"
    });

    // Set session context cookie for frontend
    const sessionContext = Buffer.from(JSON.stringify({
      principal: {
        userId: session.userId,
        tenantId: session.tenantId,
        role: session.role,
        expiresAtIso: session.expiresAtIso
      }
    })).toString("base64url");

    response.cookie("lia_session_ctx", sessionContext, {
      httpOnly: false, // Frontend needs to read this
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      expires: new Date(session.expiresAtIso),
      path: "/"
    });

    return {
      userId: session.userId,
      tenantId: session.tenantId,
      role: session.role,
      expiresAtIso: session.expiresAtIso
    };
  }

  // Dev mode login - bypass OIDC for local development
  @Get("dev-login")
  async devLogin(@Query("role") role: string, @Query("redirect") redirectUrl: string, @Res({ passthrough: true }) response: Response) {
    const validRoles = ["admin", "receptionist", "clinician", "patient"];
    const selectedRole = validRoles.includes(role) ? role : "admin";

    // Create a mock session for development
    const session = await this.authService.createDevSession(selectedRole);

    // Set session ID cookie
    response.cookie("lia_session", session.sessionId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      expires: new Date(session.expiresAtIso),
      path: "/"
    });

    // Set session context cookie for frontend
    const sessionContext = Buffer.from(JSON.stringify({
      principal: {
        userId: session.userId,
        tenantId: session.tenantId,
        role: session.role,
        expiresAtIso: session.expiresAtIso
      }
    })).toString("base64url");

    response.cookie("lia_session_ctx", sessionContext, {
      httpOnly: false, // Frontend needs to read this
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      expires: new Date(session.expiresAtIso),
      path: "/"
    });

    // Redirect to frontend after successful login
    const frontendUrl = redirectUrl || "http://localhost:3310";
    response.redirect(frontendUrl);
  }
}
