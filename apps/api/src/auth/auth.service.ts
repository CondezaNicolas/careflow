import { Inject, Injectable } from "@nestjs/common";

import { parseEnv } from "../config/env.js";
import type { SessionRecord } from "./auth.types.js";
import { OidcClient } from "./oidc.client.js";
import { SessionStore } from "./session.store.js";

@Injectable()
export class AuthService {
  private readonly env = parseEnv(process.env);

  constructor(
    @Inject(OidcClient) private readonly oidcClient: OidcClient,
    @Inject(SessionStore) private readonly sessionStore: SessionStore
  ) {}

  async issueSessionFromOidcCode(code: string): Promise<SessionRecord> {
    const profile = await this.oidcClient.exchangeCodeForProfile(code);

    return await this.sessionStore.issueSession(
      {
        userId: profile.subject,
        tenantId: profile.tenantId,
        role: profile.role,
        email: profile.email
      },
      this.env.SESSION_TTL_MINUTES
    );
  }

  // Create a dev session for local development without OIDC
  async createDevSession(role: string): Promise<SessionRecord> {
    const devUserId = `dev-${role}-user`;
    const devTenantId = "dev-tenant";

    return await this.sessionStore.issueSession(
      {
        userId: devUserId,
        tenantId: devTenantId,
        role: role,
        email: `dev-${role}@example.com`
      },
      this.env.SESSION_TTL_MINUTES
    );
  }

  getSessionCookieName(): string {
    return this.env.SESSION_COOKIE_NAME;
  }
}
