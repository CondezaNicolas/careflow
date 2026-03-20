import { z } from "zod";

const APP_NODE_ENV = {
  DEVELOPMENT: "development",
  TEST: "test",
  PRODUCTION: "production"
} as const;

const PLATFORM_RUNTIME_MODE = {
  LOCAL: "local",
  TEST: "test",
  PRODUCTION: "production"
} as const;

const DEV_DEFAULTS = {
  DATABASE_URL: "postgresql://lia:lia@localhost:5432/lia_clinic",
  REDIS_URL: "redis://localhost:6379",
  JWT_SECRET: "dev-jwt-secret-please-override-in-production-32ch!",
  JWT_REFRESH_SECRET: "dev-refresh-secret-please-override-in-production-32ch!",
  SESSION_SECRET: "dev-session-secret-please-override-in-production-32ch!"
} as const;

const LOCAL_ALLOWED_ORIGINS = ["http://localhost:3310", "http://localhost:3000"] as const;
const TOKEN_TTL_PATTERN = /^\d+[smhd]$/;
const PLACEHOLDER_SECRET_VALUES = new Set<string>([
  "replace-me",
  "changeme",
  "change-me",
  "your-secret-here",
  "your-secret",
  "secret"
]);

const optionalEnvString = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}, z.string().min(1).optional());

const envSchema = z
  .object({
    NODE_ENV: z
      .enum([APP_NODE_ENV.DEVELOPMENT, APP_NODE_ENV.TEST, APP_NODE_ENV.PRODUCTION])
      .default(APP_NODE_ENV.DEVELOPMENT),
    DATABASE_URL: z.string().url().default(DEV_DEFAULTS.DATABASE_URL),
    REDIS_URL: z.string().url().default(DEV_DEFAULTS.REDIS_URL),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    ENABLE_REQUEST_LOGGING: z.coerce.boolean().default(true),
    ALLOWED_ORIGINS: optionalEnvString,
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900_000),
    RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(100),
    REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
    SHUTDOWN_GRACE_PERIOD_MS: z.coerce.number().int().positive().default(10_000),
    JWT_SECRET: z.string().min(32).default(DEV_DEFAULTS.JWT_SECRET),
    JWT_REFRESH_SECRET: z.string().min(32).default(DEV_DEFAULTS.JWT_REFRESH_SECRET),
    JWT_ACCESS_TTL: z.string().regex(TOKEN_TTL_PATTERN).default("15m"),
    JWT_REFRESH_TTL: z.string().regex(TOKEN_TTL_PATTERN).default("7d"),
    AUTH_DEV_BYPASS: z.coerce.boolean().default(false),
    SESSION_COOKIE_NAME: z.string().trim().min(1).default("lia_session"),
    SESSION_SECRET: z.string().min(32).default(DEV_DEFAULTS.SESSION_SECRET),
    DEV_LOGIN_ENABLED: z.coerce.boolean().default(false),
    GOOGLE_CALENDAR_CLIENT_ID: optionalEnvString,
    GOOGLE_CALENDAR_CLIENT_SECRET: optionalEnvString,
    GOOGLE_CALENDAR_REFRESH_TOKEN: optionalEnvString,
    GOOGLE_CALENDAR_CALENDAR_ID: optionalEnvString,
    EMAIL_PROVIDER_API_KEY: optionalEnvString,
    EMAIL_PROVIDER_FROM: optionalEnvString,
    WHATSAPP_ACCESS_TOKEN: optionalEnvString,
    WHATSAPP_PHONE_NUMBER_ID: optionalEnvString,
    WHATSAPP_BUSINESS_ACCOUNT_ID: optionalEnvString
  })
  .superRefine((value, context) => {
    if (
      value.NODE_ENV !== APP_NODE_ENV.TEST &&
      new URL(value.DATABASE_URL).protocol !== "postgresql:"
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["DATABASE_URL"],
        message: "DATABASE_URL must use postgresql:// protocol"
      });
    }

    if (value.ALLOWED_ORIGINS) {
      const invalidOrigins = value.ALLOWED_ORIGINS.split(",")
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0)
        .filter((origin) => {
          try {
            const url = new URL(origin);
            return url.protocol !== "http:" && url.protocol !== "https:";
          } catch {
            return true;
          }
        });

      if (invalidOrigins.length > 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["ALLOWED_ORIGINS"],
          message: "ALLOWED_ORIGINS must contain only comma-separated http(s) URLs"
        });
      }
    }

    if (value.AUTH_DEV_BYPASS && value.NODE_ENV === APP_NODE_ENV.PRODUCTION) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["AUTH_DEV_BYPASS"],
        message: "AUTH_DEV_BYPASS cannot be true when NODE_ENV=production"
      });
    }

    if (value.DEV_LOGIN_ENABLED && value.NODE_ENV === APP_NODE_ENV.PRODUCTION) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["DEV_LOGIN_ENABLED"],
        message: "DEV_LOGIN_ENABLED cannot be true when NODE_ENV=production"
      });
    }

    if (value.NODE_ENV !== APP_NODE_ENV.PRODUCTION) {
      return;
    }

    validateRequiredProductionSecret("JWT_SECRET", value.JWT_SECRET, context);
    validateRequiredProductionSecret("JWT_REFRESH_SECRET", value.JWT_REFRESH_SECRET, context);
    validateRequiredProductionSecret("SESSION_SECRET", value.SESSION_SECRET, context);
  });

export type AppEnv = z.infer<typeof envSchema>;
export type AppNodeEnv = (typeof APP_NODE_ENV)[keyof typeof APP_NODE_ENV];
export type PlatformRuntimeMode =
  (typeof PLATFORM_RUNTIME_MODE)[keyof typeof PLATFORM_RUNTIME_MODE];

export interface InvalidEnvironmentIssue {
  key: string;
  message: string;
}

export class InvalidEnvironmentError extends Error {
  readonly issues: InvalidEnvironmentIssue[];

  constructor(issues: InvalidEnvironmentIssue[]) {
    super(
      `Invalid backend environment configuration: ${issues.map((issue) => issue.key).join(", ")}`
    );
    this.name = "InvalidEnvironmentError";
    this.issues = issues;
  }
}

export function parseEnv(source: NodeJS.ProcessEnv): AppEnv {
  const parsed = envSchema.safeParse(source);

  if (parsed.success) {
    return parsed.data;
  }

  throw new InvalidEnvironmentError(
    parsed.error.issues.map((issue) => ({
      key: issue.path.join(".") || "<root>",
      message: issue.message
    }))
  );
}

export function resolveRuntimeMode(nodeEnv: AppNodeEnv): PlatformRuntimeMode {
  if (nodeEnv === APP_NODE_ENV.PRODUCTION) {
    return PLATFORM_RUNTIME_MODE.PRODUCTION;
  }

  if (nodeEnv === APP_NODE_ENV.TEST) {
    return PLATFORM_RUNTIME_MODE.TEST;
  }

  return PLATFORM_RUNTIME_MODE.LOCAL;
}

export function parseDurationToSeconds(duration: string): number {
  const match = duration.match(/^(\d+)([smhd])$/);

  if (!match) {
    throw new Error(`Invalid duration: ${duration}`);
  }

  const durationUnitSeconds = {
    s: 1,
    m: 60,
    h: 3600,
    d: 86_400
  } as const;

  const unit = match[2] as keyof typeof durationUnitSeconds;
  return Number.parseInt(match[1], 10) * durationUnitSeconds[unit];
}

export function resolveAllowedOrigins(configuredOrigins?: string): string[] {
  if (!configuredOrigins) {
    return [...LOCAL_ALLOWED_ORIGINS];
  }

  return configuredOrigins
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

function validateRequiredProductionSecret(
  key: "JWT_SECRET" | "JWT_REFRESH_SECRET" | "SESSION_SECRET",
  value: string,
  context: z.RefinementCtx
): void {
  const normalizedValue = value.trim().toLowerCase();
  const isDefaultValue = value === DEV_DEFAULTS[key];
  const isPlaceholderValue = PLACEHOLDER_SECRET_VALUES.has(normalizedValue);

  if (isDefaultValue || isPlaceholderValue) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: [key],
      message: `${key} must be set to a production-safe secret`
    });
  }
}
