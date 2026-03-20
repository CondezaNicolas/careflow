import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as crypto from "crypto";

import type { AuthPrincipal, UserRole } from "@lia/shared-types";

import { AuditRepository } from "../audit/audit.repository.js";
import { AUDIT_ACTION, resolveMutationMeta } from "../audit/audit.types.js";
import { getLogger } from "../common/observability/platform-logger.js";
import { PlatformConfigService } from "../config/platform-config.service.js";
import { UsersService } from "../users/users.service.js";
import { UsersRepository } from "../users/users.repository.js";
import { USER_ROLE } from "../common/constants/user-role.js";
import { LoginDto, RegisterDto } from "./dtos/index.js";
import type { User } from "../users/entities/user.entity.js";

const DEV_AUTH = {
  EMAIL_DOMAIN: "@example.com",
  PASSWORD: "dev-bypass"
} as const;

const SUPPORTED_DEV_LOGIN_ROLE = {
  ADMIN: USER_ROLE.ADMIN,
  CLINICIAN: USER_ROLE.CLINICIAN,
  RECEPTIONIST: USER_ROLE.RECEPTIONIST,
  PATIENT: USER_ROLE.PATIENT
} as const;

interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(UsersService) private readonly usersService: UsersService,
    @Inject(UsersRepository) private readonly usersRepository: UsersRepository,
    @Inject(JwtService) private readonly jwtService: JwtService,
    @Inject(PlatformConfigService) private readonly platformConfig: PlatformConfigService,
    @Inject(AuditRepository) private readonly auditRepository: AuditRepository
  ) {}

  async register(dto: RegisterDto): Promise<{ userId: string }> {
    const normalizedEmail = normalizeEmail(dto.email);

    // Check if user exists
    const existing = await this.usersRepository.findByEmail(normalizedEmail);
    if (existing) {
      throw new ConflictException("Email already registered");
    }

    // Create user
    const user = await this.usersService.create(
      normalizedEmail,
      dto.password,
      dto.role ?? USER_ROLE.PATIENT
    );

    await this.recordAuditEvent(AUDIT_ACTION.AUTH_REGISTERED, user, {
      registeredRole: user.role
    });

    return { userId: user.id };
  }

  async login(dto: LoginDto): Promise<TokenPair> {
    const normalizedEmail = normalizeEmail(dto.email);

    // DEV BYPASS
    if (this.shouldUseDevBypass(normalizedEmail, dto.password)) {
      getLogger({ component: AuthService.name }).warn({
        event: "auth.dev_bypass.used",
        email: normalizedEmail
      });

      const devUser = await this.usersRepository.findByEmail(normalizedEmail);
      if (devUser) {
        const tokenPair = await this.issueTokenPair(devUser);
        await this.recordAuditEvent(AUDIT_ACTION.AUTH_LOGIN_SUCCEEDED, devUser, {
          authFlow: "dev_bypass"
        });
        return tokenPair;
      }

      // Auto-create dev user
      const newUser = await this.usersService.create(
        normalizedEmail,
        "dev-password",
        resolveDevBypassRole(normalizedEmail)
      );
      const tokenPair = await this.issueTokenPair(newUser);
      await this.recordAuditEvent(AUDIT_ACTION.AUTH_LOGIN_SUCCEEDED, newUser, {
        authFlow: "dev_bypass"
      });
      return tokenPair;
    }

    // Normal login
    const user = await this.usersRepository.findByEmail(normalizedEmail);
    if (!user) {
      getLogger({ component: AuthService.name }).warn({
        event: "auth.login.failed",
        email: normalizedEmail,
        reason: "user_not_found"
      });
      throw new UnauthorizedException("Invalid credentials");
    }

    const isValid = await this.usersService.validatePassword(user, dto.password);
    if (!isValid) {
      getLogger({ component: AuthService.name }).warn({
        event: "auth.login.failed",
        email: normalizedEmail,
        reason: "invalid_password"
      });
      throw new UnauthorizedException("Invalid credentials");
    }

    const tokenPair = await this.issueTokenPair(user);
    await this.recordAuditEvent(AUDIT_ACTION.AUTH_LOGIN_SUCCEEDED, user, {
      authFlow: "password"
    });

    return tokenPair;
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    const normalizedToken = normalizeRefreshToken(refreshToken);
    const tokenHash = this.hashToken(normalizedToken);

    const tokenData = await this.usersRepository.findRefreshTokenByHash(tokenHash);
    if (!tokenData) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    if (tokenData.expiresAt.getTime() <= Date.now()) {
      await this.usersRepository.revokeAllTokensInFamily(tokenData.family);
      throw new UnauthorizedException("Refresh token expired");
    }

    if (tokenData.revokedAt) {
      await this.usersRepository.revokeActiveRefreshTokensForUser(tokenData.userId, tokenData);
      throw new UnauthorizedException("Token reuse detected");
    }

    const user = await this.usersRepository.findById(tokenData.userId);
    if (!user) {
      throw new UnauthorizedException("User not found");
    }

    if (user.tenantId !== tokenData.tenantId) {
      await this.usersRepository.revokeActiveRefreshTokensForUser(tokenData.userId, tokenData);
      throw new UnauthorizedException("Refresh token tenant mismatch");
    }

    const nextTokens = await this.issueTokenPair(user, tokenData.family);
    await this.usersRepository.revokeRefreshToken(tokenHash, nextTokens.refreshTokenId);
    await this.recordAuditEvent(
      AUDIT_ACTION.AUTH_REFRESH_ROTATED,
      user,
      {
        family: tokenData.family,
        refreshTokenId: nextTokens.refreshTokenId
      },
      "auth_refresh_token_family",
      tokenData.family
    );

    return {
      accessToken: nextTokens.accessToken,
      refreshToken: nextTokens.refreshToken,
      expiresIn: nextTokens.expiresIn
    };
  }

  async logout(principal: AuthPrincipal, refreshToken: string): Promise<void> {
    const normalizedToken = normalizeRefreshToken(refreshToken);
    const tokenHash = this.hashToken(normalizedToken);
    const tokenData = await this.usersRepository.findRefreshTokenByHash(tokenHash);

    if (
      !tokenData ||
      tokenData.userId !== principal.id ||
      tokenData.tenantId !== principal.tenantId
    ) {
      throw new UnauthorizedException("Refresh token does not belong to the authenticated user");
    }

    await this.usersRepository.revokeAllTokensInFamily(tokenData.family);
    await this.recordAuditEvent(
      AUDIT_ACTION.AUTH_LOGOUT_COMPLETED,
      principal,
      {
        family: tokenData.family
      },
      "auth_refresh_token_family",
      tokenData.family
    );
  }

  async loginAsDevRole(role: UserRole): Promise<TokenPair> {
    this.assertDevLoginEnabled();

    const email = `dev-${role}${DEV_AUTH.EMAIL_DOMAIN}`;
    const existingUser = await this.usersRepository.findByEmail(email);
    if (existingUser) {
      const tokenPair = await this.issueTokenPair(existingUser);
      await this.recordAuditEvent(AUDIT_ACTION.AUTH_DEV_LOGIN_ISSUED, existingUser, {
        role
      });
      return tokenPair;
    }

    const createdUser = await this.usersService.create(email, "dev-password", role);
    const tokenPair = await this.issueTokenPair(createdUser);
    await this.recordAuditEvent(AUDIT_ACTION.AUTH_DEV_LOGIN_ISSUED, createdUser, {
      role
    });
    return tokenPair;
  }

  private async recordAuditEvent(
    action: (typeof AUDIT_ACTION)[keyof typeof AUDIT_ACTION],
    actor: Pick<User, "id" | "tenantId" | "role"> | AuthPrincipal,
    metadata: Record<string, unknown>,
    entityType: string = "user",
    entityId: string = actor.id
  ): Promise<void> {
    const mutationMeta = resolveMutationMeta(undefined);

    await this.auditRepository.saveDomainEvent({
      id: crypto.randomUUID(),
      tenantId: actor.tenantId,
      actorId: actor.id,
      actorRole: actor.role,
      source: mutationMeta.source,
      action,
      entityType,
      entityId,
      requestId: mutationMeta.requestId,
      traceId: mutationMeta.traceId,
      metadata
    });
  }

  private async issueTokenPair(
    user: User,
    family: string = crypto.randomUUID()
  ): Promise<TokenPair & { refreshTokenId: string }> {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId
    };

    const accessExpiresIn = this.platformConfig.auth.accessTokenTtlSeconds;

    const accessToken = this.jwtService.sign(payload as Record<string, unknown>, {
      secret: this.platformConfig.auth.jwtSecret,
      expiresIn: accessExpiresIn
    });

    // Generate refresh token (opaque, stored in DB)
    const refreshToken = crypto.randomBytes(64).toString("hex");
    const tokenHash = this.hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + this.platformConfig.auth.refreshTokenTtlSeconds * 1000);

    const savedRefreshToken = await this.usersRepository.saveRefreshToken({
      userId: user.id,
      tenantId: user.tenantId,
      tokenHash,
      family,
      expiresAt
    });

    return {
      accessToken,
      refreshToken, // Return raw token (opaque)
      expiresIn: accessExpiresIn,
      refreshTokenId: savedRefreshToken.id
    };
  }

  private shouldUseDevBypass(email: string, password: string): boolean {
    if (!this.platformConfig.auth.devBypassEnabled) {
      return false;
    }

    if (this.platformConfig.runtime.isProduction) {
      return false;
    }

    return password === DEV_AUTH.PASSWORD && isDevLoginEmail(email);
  }

  private assertDevLoginEnabled(): void {
    if (!this.platformConfig.auth.devLoginEnabled || this.platformConfig.runtime.isProduction) {
      throw new NotFoundException("Dev login disabled");
    }
  }

  private hashToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeRefreshToken(token: string): string {
  const normalizedToken = token.trim();
  if (normalizedToken.length === 0) {
    throw new UnauthorizedException("Refresh token is required");
  }

  return normalizedToken;
}

function isDevLoginEmail(email: string): boolean {
  return /^dev-(admin|clinician|receptionist|patient)@example\.com$/u.test(email);
}

function resolveDevBypassRole(email: string): UserRole {
  const role = email.slice(4, email.indexOf("@"));

  switch (role) {
    case SUPPORTED_DEV_LOGIN_ROLE.ADMIN:
      return USER_ROLE.ADMIN;
    case SUPPORTED_DEV_LOGIN_ROLE.CLINICIAN:
      return USER_ROLE.CLINICIAN;
    case SUPPORTED_DEV_LOGIN_ROLE.RECEPTIONIST:
      return USER_ROLE.RECEPTIONIST;
    case SUPPORTED_DEV_LOGIN_ROLE.PATIENT:
      return USER_ROLE.PATIENT;
    default:
      return USER_ROLE.CLINICIAN;
  }
}
