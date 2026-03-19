import type { UserRole } from "../common/constants/user-role.js";

export interface OidcProfile {
  subject: string;
  email: string;
  tenantId: string;
  role: UserRole;
}

export interface SessionRecord {
  sessionId: string;
  userId: string;
  tenantId: string;
  email: string;
  role: UserRole;
  expiresAtIso: string;
}
