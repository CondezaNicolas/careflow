import { randomUUID } from "node:crypto";

import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";

import type { AuthPrincipal } from "@lia/shared-types";
import { DatabaseService } from "../db/database.service.js";
import type { SessionRecord } from "./auth.types.js";

@Injectable()
export class SessionStore {
  constructor(@Inject(DatabaseService) private readonly databaseService: DatabaseService) {}

  async issueSession(
    input: Omit<SessionRecord, "sessionId" | "expiresAtIso">,
    ttlMinutes: number
  ): Promise<SessionRecord> {
    const sessionId = randomUUID();
    const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);
    const record: SessionRecord = {
      ...input,
      sessionId,
      expiresAtIso: expiresAt.toISOString()
    };

    await this.databaseService.query(
      `
        INSERT INTO auth_principal_sessions (session_id, user_subject, tenant_id, email, role_name, expires_at)
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [sessionId, input.userId, input.tenantId, input.email, input.role, expiresAt]
    );

    return record;
  }

  async resolvePrincipal(sessionId: string): Promise<AuthPrincipal> {
    const result = await this.databaseService.query<{
      user_subject: string;
      tenant_id: string;
      email: string;
      role_name: AuthPrincipal["role"];
      expires_at: Date;
    }>(
      `
        SELECT user_subject, tenant_id, email, role_name, expires_at
        FROM auth_principal_sessions
        WHERE session_id = $1
      `,
      [sessionId]
    );

    const session = result.rows[0];
    if (!session) {
      throw new UnauthorizedException("Invalid session");
    }

    if (session.expires_at.getTime() < Date.now()) {
      await this.databaseService.query("DELETE FROM auth_principal_sessions WHERE session_id = $1", [sessionId]);
      throw new UnauthorizedException("Session expired");
    }

    return {
      id: session.user_subject,
      tenantId: session.tenant_id,
      role: session.role_name,
      email: session.email
    };
  }
}
