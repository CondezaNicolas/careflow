import type { Request } from "express";

import type { AuthPrincipal, UserRole } from "@lia/shared-types";

import type { RequestContext } from "../common/observability/request-context.js";

// Kept for backward compatibility during transition
export interface OidcProfile {
  subject: string;
  email: string;
  tenantId: string;
  role: UserRole;
}

// SessionRecord kept for compatibility with existing code
export interface SessionRecord {
  sessionId: string;
  userId: string;
  tenantId: string;
  email: string;
  role: UserRole;
  expiresAtIso: string;
}

// JWT token payload structure
export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  tenantId: string;
  family?: string;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedRequest extends Request {
  principal?: AuthPrincipal;
  user?: JwtPayload | AuthPrincipal;
  context?: RequestContext;
}

export function toAuthPrincipal(payload: JwtPayload | AuthPrincipal): AuthPrincipal {
  if ("id" in payload) {
    return payload;
  }

  return {
    id: payload.sub,
    tenantId: payload.tenantId,
    role: payload.role,
    email: payload.email
  };
}

export function getRequestPrincipal(request: AuthenticatedRequest): AuthPrincipal | undefined {
  if (request.principal) {
    return request.principal;
  }

  if (!request.user) {
    return undefined;
  }

  const principal = toAuthPrincipal(request.user);
  request.principal = principal;
  request.user = principal;

  return principal;
}
