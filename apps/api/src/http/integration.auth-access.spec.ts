import "reflect-metadata";

import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import cookieParser from "cookie-parser";
import { UnauthorizedException, type INestApplication } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Test, type TestingModule } from "@nestjs/testing";
import request from "supertest";

import { AuthController } from "../auth/auth.controller.js";
import { AuthService } from "../auth/auth.service.js";
import { AuthenticatedGuard } from "../auth/guards/authenticated.guard.js";
import { RolesGuard } from "../auth/guards/roles.guard.js";
import { SessionStore } from "../auth/session.store.js";
import { PatientRepository } from "../patients/patient.repository.js";
import { PatientsController } from "../patients/patients.controller.js";
import { PatientsService } from "../patients/patients.service.js";

interface MockPrincipal {
  id: string;
  tenantId: string;
  role: "admin" | "clinician" | "receptionist";
  email: string;
}

describe("HTTP integration: auth and tenant/RBAC enforcement", () => {
  let app: INestApplication | undefined;
  let moduleRef: TestingModule | undefined;

  beforeEach(async () => {
    process.env.NODE_ENV = "test";
    process.env.DATABASE_URL = "postgresql://lia:lia@localhost:5432/lia_clinic";
    process.env.OIDC_ISSUER = "https://issuer.example.test";
    process.env.OIDC_CLIENT_ID = "client-id";
    process.env.OIDC_CLIENT_SECRET = "client-secret";
    process.env.OIDC_REDIRECT_URI = "https://api.example.test/auth/callback";
    process.env.OIDC_AUDIENCE = "client-id";
    process.env.OIDC_TENANT_CLAIM = "tenant_id";
    process.env.OIDC_ROLE_CLAIM = "role";
    process.env.SESSION_COOKIE_NAME = "lia_session";
    process.env.SESSION_TTL_MINUTES = "60";

    const principalsBySessionId: Record<string, MockPrincipal> = {
      "tenant-a-clinician": {
        id: "usr-1",
        tenantId: "tenant-demo",
        role: "clinician",
        email: "clinician@lia.local"
      },
      "tenant-a-receptionist": {
        id: "usr-2",
        tenantId: "tenant-demo",
        role: "receptionist",
        email: "reception@lia.local"
      }
    };

    moduleRef = await Test.createTestingModule({
      controllers: [AuthController, PatientsController],
      providers: [
        PatientsService,
        PatientRepository,
        AuthenticatedGuard,
        RolesGuard,
        Reflector,
        {
          provide: AuthService,
          useValue: {
            async issueSessionFromOidcCode(code: string) {
              if (code !== "good-code") {
                throw new UnauthorizedException("OIDC token exchange failed with status 401");
              }

              return {
                sessionId: "tenant-a-clinician",
                userId: "oidc-user-1",
                tenantId: "tenant-demo",
                email: "clinician@lia.local",
                role: "clinician" as const,
                expiresAtIso: new Date(Date.now() + 60_000).toISOString()
              };
            },
            getSessionCookieName() {
              return "lia_session";
            }
          }
        },
        {
          provide: SessionStore,
          useValue: {
            async resolvePrincipal(sessionId: string) {
              const principal = principalsBySessionId[sessionId];
              if (!principal) {
                throw new UnauthorizedException("Invalid session");
              }

              return principal;
            }
          }
        }
      ]
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }

    if (moduleRef) {
      await moduleRef.close();
      moduleRef = undefined;
    }
  });

  it("handles /auth/callback happy path and sets session cookie", async () => {
    const response = await request(app!.getHttpServer())
      .get("/auth/callback")
      .query({ code: "good-code" })
      .expect(200);

    assert.equal(response.body.tenantId, "tenant-demo");
    assert.equal(response.body.role, "clinician");
    assert.match(String(response.headers["set-cookie"]), /lia_session=tenant-a-clinician/);
  });

  it("handles /auth/callback failure path for invalid code", async () => {
    const response = await request(app!.getHttpServer())
      .get("/auth/callback")
      .query({ code: "bad-code" })
      .expect(401);

    assert.equal(response.body.message, "OIDC token exchange failed with status 401");
  });

  it("denies cross-tenant patient chart access", async () => {
    const response = await request(app!.getHttpServer())
      .get("/patients/pt-2/chart")
      .set("Cookie", ["lia_session=tenant-a-clinician"])
      .expect(404);

    assert.equal(response.body.message, "Patient not found");
  });
});
