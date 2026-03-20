import { Injectable } from "@nestjs/common";
import type { CookieOptions } from "express";

import {
  parseDurationToSeconds,
  parseEnv,
  resolveAllowedOrigins,
  resolveRuntimeMode,
  type AppEnv,
  type AppNodeEnv,
  type PlatformRuntimeMode
} from "./env.js";

const AUTH_ROUTE_RATE_LIMIT_DEFAULTS = {
  LOGIN_MAX_REQUESTS: 5,
  REFRESH_MAX_REQUESTS: 20,
  LOGOUT_MAX_REQUESTS: 20,
  DEV_LOGIN_MAX_REQUESTS: 3
} as const;

export interface PlatformRuntimeConfig {
  nodeEnv: AppNodeEnv;
  mode: PlatformRuntimeMode;
  isDevelopment: boolean;
  isTest: boolean;
  isProduction: boolean;
}

export interface PlatformServerConfig {
  apiPort: number;
  allowedOrigins: string[];
  requestLoggingEnabled: boolean;
  requestTimeoutMs: number;
  shutdownGracePeriodMs: number;
}

export interface PlatformRateLimitConfig {
  windowMs: number;
  maxRequests: number;
  auth: PlatformAuthRateLimitConfig;
}

export interface PlatformAuthRateLimitConfig {
  loginMaxRequests: number;
  refreshMaxRequests: number;
  logoutMaxRequests: number;
  devLoginMaxRequests: number;
}

export interface PlatformCookieConfig {
  sessionCookieName: string;
  sessionSecret: string;
  sameSite: "lax";
  secure: boolean;
}

export interface PlatformAuthConfig {
  jwtSecret: string;
  jwtRefreshSecret: string;
  accessTokenTtl: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtl: string;
  refreshTokenTtlSeconds: number;
  devBypassEnabled: boolean;
  devLoginEnabled: boolean;
}

export interface PlatformDatabaseConfig {
  url: string;
}

export interface PlatformIntegrationConfig {
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  calendarId?: string;
  apiKey?: string;
  from?: string;
  accessToken?: string;
  phoneNumberId?: string;
  businessAccountId?: string;
}

export interface PlatformOpsConfig {
  productionPreflightRequired: boolean;
  integrations: PlatformOpsIntegrationsConfig;
}

export interface PlatformOpsIntegrationsConfig {
  googleCalendar: PlatformIntegrationConfig;
  email: PlatformIntegrationConfig;
  whatsapp: PlatformIntegrationConfig;
}

@Injectable()
export class PlatformConfigService {
  private readonly env: AppEnv = parseEnv(process.env);

  readonly runtime: PlatformRuntimeConfig = {
    nodeEnv: this.env.NODE_ENV,
    mode: resolveRuntimeMode(this.env.NODE_ENV),
    isDevelopment: this.env.NODE_ENV === "development",
    isTest: this.env.NODE_ENV === "test",
    isProduction: this.env.NODE_ENV === "production"
  };

  readonly server: PlatformServerConfig = {
    apiPort: this.env.API_PORT,
    allowedOrigins: resolveAllowedOrigins(this.env.ALLOWED_ORIGINS),
    requestLoggingEnabled: this.env.ENABLE_REQUEST_LOGGING,
    requestTimeoutMs: this.env.REQUEST_TIMEOUT_MS,
    shutdownGracePeriodMs: this.env.SHUTDOWN_GRACE_PERIOD_MS
  };

  readonly rateLimit: PlatformRateLimitConfig = {
    windowMs: this.env.RATE_LIMIT_WINDOW_MS,
    maxRequests: this.env.RATE_LIMIT_MAX_REQUESTS,
    auth: {
      loginMaxRequests: Math.min(
        this.env.RATE_LIMIT_MAX_REQUESTS,
        AUTH_ROUTE_RATE_LIMIT_DEFAULTS.LOGIN_MAX_REQUESTS
      ),
      refreshMaxRequests: Math.min(
        this.env.RATE_LIMIT_MAX_REQUESTS,
        AUTH_ROUTE_RATE_LIMIT_DEFAULTS.REFRESH_MAX_REQUESTS
      ),
      logoutMaxRequests: Math.min(
        this.env.RATE_LIMIT_MAX_REQUESTS,
        AUTH_ROUTE_RATE_LIMIT_DEFAULTS.LOGOUT_MAX_REQUESTS
      ),
      devLoginMaxRequests: Math.min(
        this.env.RATE_LIMIT_MAX_REQUESTS,
        AUTH_ROUTE_RATE_LIMIT_DEFAULTS.DEV_LOGIN_MAX_REQUESTS
      )
    }
  };

  readonly cookies: PlatformCookieConfig = {
    sessionCookieName: this.env.SESSION_COOKIE_NAME,
    sessionSecret: this.env.SESSION_SECRET,
    sameSite: "lax",
    secure: this.runtime.isProduction
  };

  readonly auth: PlatformAuthConfig = {
    jwtSecret: this.env.JWT_SECRET,
    jwtRefreshSecret: this.env.JWT_REFRESH_SECRET,
    accessTokenTtl: this.env.JWT_ACCESS_TTL,
    accessTokenTtlSeconds: parseDurationToSeconds(this.env.JWT_ACCESS_TTL),
    refreshTokenTtl: this.env.JWT_REFRESH_TTL,
    refreshTokenTtlSeconds: parseDurationToSeconds(this.env.JWT_REFRESH_TTL),
    devBypassEnabled: this.env.AUTH_DEV_BYPASS,
    devLoginEnabled: this.env.DEV_LOGIN_ENABLED
  };

  readonly database: PlatformDatabaseConfig = {
    url: this.env.DATABASE_URL
  };

  readonly ops: PlatformOpsConfig = {
    productionPreflightRequired: this.runtime.isProduction,
    integrations: {
      googleCalendar: {
        clientId: this.env.GOOGLE_CALENDAR_CLIENT_ID,
        clientSecret: this.env.GOOGLE_CALENDAR_CLIENT_SECRET,
        refreshToken: this.env.GOOGLE_CALENDAR_REFRESH_TOKEN,
        calendarId: this.env.GOOGLE_CALENDAR_CALENDAR_ID
      },
      email: {
        apiKey: this.env.EMAIL_PROVIDER_API_KEY,
        from: this.env.EMAIL_PROVIDER_FROM
      },
      whatsapp: {
        accessToken: this.env.WHATSAPP_ACCESS_TOKEN,
        phoneNumberId: this.env.WHATSAPP_PHONE_NUMBER_ID,
        businessAccountId: this.env.WHATSAPP_BUSINESS_ACCOUNT_ID
      }
    }
  };

  get raw(): AppEnv {
    return this.env;
  }

  createAccessTokenCookieOptions(expiresInSeconds: number): CookieOptions {
    return {
      httpOnly: true,
      sameSite: this.cookies.sameSite,
      secure: this.cookies.secure,
      maxAge: expiresInSeconds * 1000
    };
  }

  createClearSessionCookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      sameSite: this.cookies.sameSite,
      secure: this.cookies.secure
    };
  }
}
