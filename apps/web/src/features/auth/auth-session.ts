import type {
  DevLoginResponse,
  JwtClaims,
  PersistedAuthSession,
  TokenResponse
} from "./auth.types";
import { parseJwtClaims, parsePersistedAuthSession } from "./auth.schemas";

function decodeBase64UrlSegment(segment: string): string {
  const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");

  if (typeof globalThis.atob === "function") {
    return globalThis.atob(padded);
  }

  return Buffer.from(padded, "base64").toString("utf8");
}

export function decodeJwtClaims(token: string): JwtClaims {
  const [, payload] = token.split(".");

  if (!payload) {
    throw new Error("JWT payload segment is missing");
  }

  const claims = JSON.parse(decodeBase64UrlSegment(payload)) as unknown;
  return parseJwtClaims(claims);
}

export function buildSessionFromTokenResponse(response: TokenResponse): PersistedAuthSession {
  const claims = decodeJwtClaims(response.accessToken);

  return parsePersistedAuthSession({
    accessToken: response.accessToken,
    refreshToken: response.refreshToken,
    accessTokenExpiresAt: claims.exp ? claims.exp * 1000 : Date.now() + response.expiresIn * 1000,
    principal: {
      id: claims.sub,
      tenantId: claims.tenantId,
      role: claims.role,
      email: claims.email
    }
  });
}

export function buildSessionFromDevLoginResponse(response: DevLoginResponse): PersistedAuthSession {
  const claims = decodeJwtClaims(response.accessToken);

  return parsePersistedAuthSession({
    accessToken: response.accessToken,
    refreshToken: null,
    accessTokenExpiresAt: claims.exp ? claims.exp * 1000 : Date.now(),
    principal: {
      id: claims.sub,
      tenantId: claims.tenantId,
      role: claims.role,
      email: claims.email
    }
  });
}

export function isSessionExpired(session: PersistedAuthSession, now = Date.now()): boolean {
  return session.accessTokenExpiresAt <= now;
}

export function getActiveSession(
  session: PersistedAuthSession | null,
  now = Date.now()
): PersistedAuthSession | null {
  if (!session) {
    return null;
  }

  return isSessionExpired(session, now) ? null : session;
}
