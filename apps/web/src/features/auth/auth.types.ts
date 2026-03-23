export const USER_ROLE = {
  ADMIN: "admin",
  CLINICIAN: "clinician",
  RECEPTIONIST: "receptionist",
  PATIENT: "patient"
} as const;

export type UserRole = (typeof USER_ROLE)[keyof typeof USER_ROLE];

export interface AuthPrincipal {
  id: string;
  tenantId: string;
  role: UserRole;
  email: string;
}

export interface JwtClaims {
  sub: string;
  email: string;
  role: UserRole;
  tenantId: string;
  family?: string;
  iat?: number;
  exp?: number;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface RefreshInput {
  refreshToken: string;
}

export interface LogoutInput {
  refreshToken: string;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LogoutResponse {
  success: true;
}

export interface DevLoginInput {
  role?: UserRole;
  redirect?: string;
}

export interface DevLoginResponse {
  success: true;
  role: UserRole;
  redirectUrl?: string;
  accessToken: string;
}

export interface PersistedAuthSession {
  accessToken: string;
  refreshToken: string | null;
  accessTokenExpiresAt: number;
  principal: AuthPrincipal;
}

export const AUTH_REQUEST = {
  LOGIN: "login",
  DEV_LOGIN: "dev-login",
  REFRESH: "refresh",
  LOGOUT: "logout"
} as const;

export type AuthRequest = (typeof AUTH_REQUEST)[keyof typeof AUTH_REQUEST];

export const AUTH_STATUS = {
  ANONYMOUS: "anonymous",
  AUTHENTICATED: "authenticated"
} as const;

export type AuthStatus = (typeof AUTH_STATUS)[keyof typeof AUTH_STATUS];

export const AUTH_STATE_EVENT = {
  SESSION_EXPIRED: "session-expired",
  SIGNED_OUT: "signed-out"
} as const;

export type AuthStateEvent = (typeof AUTH_STATE_EVENT)[keyof typeof AUTH_STATE_EVENT];
