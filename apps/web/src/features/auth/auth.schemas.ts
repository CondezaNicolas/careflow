import { z } from "zod";

import type {
  DevLoginResponse,
  JwtClaims,
  LoginInput,
  LogoutResponse,
  PersistedAuthSession,
  RefreshInput,
  TokenResponse,
  UserRole
} from "./auth.types";
import { USER_ROLE } from "./auth.types";

const USER_ROLE_VALUES = Object.values(USER_ROLE) as [UserRole, ...UserRole[]];

export const userRoleSchema = z.enum(USER_ROLE_VALUES);

export const loginInputSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().trim().min(8)
});

export const refreshInputSchema = z.object({
  refreshToken: z.string().trim().min(1)
});

export const logoutInputSchema = refreshInputSchema;

export const authPrincipalSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  role: userRoleSchema,
  email: z.string().email()
});

export const jwtClaimsSchema = z.object({
  sub: z.string().min(1),
  email: z.string().email(),
  role: userRoleSchema,
  tenantId: z.string().min(1),
  family: z.string().min(1).optional(),
  iat: z.number().int().optional(),
  exp: z.number().int().optional()
});

export const tokenResponseSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresIn: z.number().int().positive()
});

export const logoutResponseSchema = z.object({
  success: z.literal(true)
});

export const devLoginResponseSchema = z.object({
  success: z.literal(true),
  role: userRoleSchema,
  redirectUrl: z.string().trim().optional(),
  accessToken: z.string().min(1)
});

export const persistedAuthSessionSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1).nullable(),
  accessTokenExpiresAt: z.number().int().positive(),
  principal: authPrincipalSchema
});

export function parseLoginInput(input: unknown): LoginInput {
  return loginInputSchema.parse(input);
}

export function parseRefreshInput(input: unknown): RefreshInput {
  return refreshInputSchema.parse(input);
}

export function parseTokenResponse(input: unknown): TokenResponse {
  return tokenResponseSchema.parse(input);
}

export function parseLogoutResponse(input: unknown): LogoutResponse {
  return logoutResponseSchema.parse(input);
}

export function parseDevLoginResponse(input: unknown): DevLoginResponse {
  return devLoginResponseSchema.parse(input);
}

export function parsePersistedAuthSession(input: unknown): PersistedAuthSession {
  return persistedAuthSessionSchema.parse(input);
}

export function parseJwtClaims(input: unknown): JwtClaims {
  return jwtClaimsSchema.parse(input);
}
