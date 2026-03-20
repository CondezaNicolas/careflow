import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import * as crypto from "crypto";

import { NotFoundException, UnauthorizedException } from "@nestjs/common";
import { AUDIT_ACTION } from "../audit/audit.types.js";
import { USER_ROLE } from "../common/constants/user-role.js";
import { AuthService } from "./auth.service.js";

const BASE_USER = {
  id: "usr-1",
  tenantId: "00000000-0000-4000-8000-000000000001",
  email: "clinician@lia.local",
  passwordHash: "hashed-password",
  role: USER_ROLE.CLINICIAN,
  createdAt: new Date("2026-03-20T12:00:00.000Z"),
  updatedAt: new Date("2026-03-20T12:00:00.000Z")
} as const;

describe("AuthService", () => {
  let savedRefreshToken:
    | {
        expiresAt: Date;
        family: string;
        tenantId: string;
        tokenHash: string;
        userId: string;
      }
    | undefined;
  let revokedRefreshToken:
    | {
        replacedByTokenId?: string;
        tokenHash: string;
      }
    | undefined;
  let revokedFamily: string | undefined;
  let revokedUserScope:
    | {
        tenantId: string;
        userId: string;
      }
    | undefined;
  let auditEvents:
    | Array<{
        action: string;
        entityId: string;
        entityType: string;
        metadata: Record<string, unknown>;
      }>
    | undefined;
  let validatePasswordCalls = 0;

  function createAuthService(overrides?: {
    devBypassEnabled?: boolean;
    devLoginEnabled?: boolean;
    findByEmail?: (email: string) => Promise<typeof BASE_USER | null>;
    findById?: (id: string) => Promise<typeof BASE_USER | null>;
    findRefreshTokenByHash?: (tokenHash: string) => Promise<{
      id: string;
      userId: string;
      tenantId: string;
      family: string;
      expiresAt: Date;
      revokedAt: Date | null;
      replacedByTokenId: string | null;
    } | null>;
    validatePassword?: (user: typeof BASE_USER, password: string) => Promise<boolean>;
  }) {
    savedRefreshToken = undefined;
    revokedRefreshToken = undefined;
    revokedFamily = undefined;
    revokedUserScope = undefined;
    auditEvents = [];
    validatePasswordCalls = 0;

    const usersService = {
      create: async (email: string, _password: string, role: typeof BASE_USER.role) => ({
        ...BASE_USER,
        email,
        role
      }),
      validatePassword: async (user: typeof BASE_USER, password: string) => {
        validatePasswordCalls += 1;
        return overrides?.validatePassword?.(user, password) ?? password === "ValidPass1";
      }
    } as unknown as import("../users/users.service.js").UsersService;

    const usersRepository = {
      findByEmail: overrides?.findByEmail ?? (async () => BASE_USER),
      findById: overrides?.findById ?? (async () => BASE_USER),
      findRefreshTokenByHash:
        overrides?.findRefreshTokenByHash ??
        (async () => ({
          id: "rt-1",
          userId: BASE_USER.id,
          tenantId: BASE_USER.tenantId,
          family: "11111111-1111-4111-8111-111111111111",
          expiresAt: new Date(Date.now() + 60_000),
          revokedAt: null,
          replacedByTokenId: null
        })),
      saveRefreshToken: async (data: {
        userId: string;
        tenantId: string;
        tokenHash: string;
        family: string;
        expiresAt: Date;
      }) => {
        savedRefreshToken = data;
        return { id: "rt-2" };
      },
      revokeRefreshToken: async (tokenHash: string, replacedByTokenId?: string) => {
        revokedRefreshToken = {
          tokenHash,
          replacedByTokenId
        };
      },
      revokeAllTokensInFamily: async (family: string) => {
        revokedFamily = family;
      },
      revokeActiveRefreshTokensForUser: async (userId: string, scope: { tenantId: string }) => {
        revokedUserScope = {
          userId,
          tenantId: scope.tenantId
        };
      }
    } as unknown as import("../users/users.repository.js").UsersRepository;

    const jwtService = {
      sign: () => "access.jwt"
    } as unknown as import("@nestjs/jwt").JwtService;

    const platformConfig = {
      runtime: {
        isProduction: false
      },
      server: {
        allowedOrigins: ["http://localhost:3310"],
        requestLoggingEnabled: true,
        requestTimeoutMs: 30_000,
        shutdownGracePeriodMs: 10_000
      },
      auth: {
        jwtSecret: "jwt-secret-32-characters-minimum!!",
        accessTokenTtlSeconds: 900,
        refreshTokenTtlSeconds: 604_800,
        devBypassEnabled: overrides?.devBypassEnabled ?? false,
        devLoginEnabled: overrides?.devLoginEnabled ?? false
      }
    } as unknown as import("../config/platform-config.service.js").PlatformConfigService;

    const auditRepository = {
      saveDomainEvent: async (event: {
        action: string;
        entityId: string;
        entityType: string;
        metadata: Record<string, unknown>;
      }) => {
        auditEvents?.push(event);
      }
    } as unknown as import("../audit/audit.repository.js").AuditRepository;

    return new AuthService(
      usersService,
      usersRepository,
      jwtService,
      platformConfig,
      auditRepository
    );
  }

  beforeEach(() => {
    createAuthService();
  });

  it("rotates refresh tokens within the same family and records the replacement", async () => {
    const refreshToken = "refresh-token-value";
    const authService = createAuthService({
      findRefreshTokenByHash: async (_tokenHash: string) => ({
        id: "rt-1",
        userId: BASE_USER.id,
        tenantId: BASE_USER.tenantId,
        family: "11111111-1111-4111-8111-111111111111",
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
        replacedByTokenId: null
      })
    });

    const result = await authService.refresh(refreshToken);

    assert.equal(result.accessToken, "access.jwt");
    assert.ok(result.refreshToken.length > 0);
    assert.equal(savedRefreshToken?.family, "11111111-1111-4111-8111-111111111111");
    assert.equal(savedRefreshToken?.userId, BASE_USER.id);
    assert.deepEqual(revokedRefreshToken, {
      tokenHash: crypto.createHash("sha256").update(refreshToken).digest("hex"),
      replacedByTokenId: "rt-2"
    });
    assert.equal(auditEvents?.[0]?.action, AUDIT_ACTION.AUTH_REFRESH_ROTATED);
  });

  it("revokes the refresh family when an expired refresh token is presented", async () => {
    const authService = createAuthService({
      findRefreshTokenByHash: async () => ({
        id: "rt-1",
        userId: BASE_USER.id,
        tenantId: BASE_USER.tenantId,
        family: "expired-family",
        expiresAt: new Date(Date.now() - 1_000),
        revokedAt: null,
        replacedByTokenId: null
      })
    });

    await assert.rejects(
      () => authService.refresh("expired-token"),
      (error: unknown) => {
        assert.ok(error instanceof UnauthorizedException);
        assert.equal(error.message, "Refresh token expired");
        return true;
      }
    );
    assert.equal(revokedFamily, "expired-family");
  });

  it("requires logout refresh tokens to belong to the authenticated user", async () => {
    const authService = createAuthService({
      findRefreshTokenByHash: async () => ({
        id: "rt-1",
        userId: "someone-else",
        tenantId: BASE_USER.tenantId,
        family: "family-1",
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
        replacedByTokenId: null
      })
    });

    await assert.rejects(
      () =>
        authService.logout(
          {
            id: BASE_USER.id,
            tenantId: BASE_USER.tenantId,
            role: BASE_USER.role,
            email: BASE_USER.email
          },
          "refresh-token-value"
        ),
      (error: unknown) => {
        assert.ok(error instanceof UnauthorizedException);
        assert.match(error.message, /authenticated user/);
        return true;
      }
    );
  });

  it("revokes all active user refresh tokens when token reuse is detected", async () => {
    const authService = createAuthService({
      findRefreshTokenByHash: async () => ({
        id: "rt-1",
        userId: BASE_USER.id,
        tenantId: BASE_USER.tenantId,
        family: "family-1",
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: new Date("2026-03-20T12:05:00.000Z"),
        replacedByTokenId: "rt-2"
      })
    });

    await assert.rejects(
      () => authService.refresh("reused-token"),
      (error: unknown) => {
        assert.ok(error instanceof UnauthorizedException);
        assert.equal(error.message, "Token reuse detected");
        return true;
      }
    );
    assert.deepEqual(revokedUserScope, {
      userId: BASE_USER.id,
      tenantId: BASE_USER.tenantId
    });
  });

  it("only allows the compatibility dev bypass for explicit dev credentials", async () => {
    const authService = createAuthService({
      devBypassEnabled: true,
      validatePassword: async () => false
    });

    await assert.rejects(
      () =>
        authService.login({
          email: "clinician@lia.local",
          password: "dev-bypass"
        }),
      (error: unknown) => {
        assert.ok(error instanceof UnauthorizedException);
        assert.equal(error.message, "Invalid credentials");
        return true;
      }
    );
    assert.equal(validatePasswordCalls, 1);
  });

  it("records audit metadata for successful password login", async () => {
    const authService = createAuthService();

    await authService.login({
      email: BASE_USER.email,
      password: "ValidPass1"
    });

    assert.equal(auditEvents?.length, 1);
    assert.equal(auditEvents?.[0]?.action, AUDIT_ACTION.AUTH_LOGIN_SUCCEEDED);
    assert.deepEqual(auditEvents?.[0]?.metadata, {
      authFlow: "password"
    });
  });

  it("records audit events for dev login issuance", async () => {
    const authService = createAuthService({ devLoginEnabled: true });

    await authService.loginAsDevRole(USER_ROLE.ADMIN);

    assert.equal(auditEvents?.[0]?.action, AUDIT_ACTION.AUTH_DEV_LOGIN_ISSUED);
    assert.equal(auditEvents?.[0]?.metadata.role, USER_ROLE.ADMIN);
  });

  it("rejects dev-login when the dedicated flag is disabled", async () => {
    const authService = createAuthService({ devLoginEnabled: false });

    await assert.rejects(
      () => authService.loginAsDevRole(USER_ROLE.ADMIN),
      (error: unknown) => {
        assert.ok(error instanceof NotFoundException);
        return true;
      }
    );
  });
});
