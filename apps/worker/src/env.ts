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

export const WORKER_PROVIDER_MODE = {
  PROVIDER: "provider",
  NOOP: "noop"
} as const;

const DEV_DEFAULTS = {
  DATABASE_URL: "postgresql://lia:lia@localhost:5432/lia_clinic"
} as const;

const optionalEnvString = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}, z.string().min(1).optional());

export interface WorkerEnvironmentIssue {
  key: string;
  message: string;
}

export class InvalidWorkerEnvironmentError extends Error {
  readonly issues: WorkerEnvironmentIssue[];

  constructor(issues: WorkerEnvironmentIssue[]) {
    super(
      `Invalid worker environment configuration: ${issues.map((issue) => issue.key).join(", ")}`
    );
    this.name = "InvalidWorkerEnvironmentError";
    this.issues = issues;
  }
}

const envSchema = z
  .object({
    NODE_ENV: z
      .enum([APP_NODE_ENV.DEVELOPMENT, APP_NODE_ENV.TEST, APP_NODE_ENV.PRODUCTION])
      .default(APP_NODE_ENV.DEVELOPMENT),
    DATABASE_URL: z.string().url().default(DEV_DEFAULTS.DATABASE_URL),
    WORKER_POLL_INTERVAL_MS: z.coerce.number().int().positive().max(300_000).default(30_000),
    WORKER_SHUTDOWN_GRACE_PERIOD_MS: z.coerce
      .number()
      .int()
      .positive()
      .max(300_000)
      .default(10_000),
    GOOGLE_CALENDAR_MAX_RETRIES: z.coerce.number().int().positive().max(10).default(5),
    GOOGLE_CALENDAR_BACKOFF_SECONDS: z.coerce.number().int().min(0).max(3_600).default(30),
    NOTIFICATIONS_MAX_RETRIES: z.coerce.number().int().positive().max(10).default(4),
    NOTIFICATIONS_BACKOFF_SECONDS: z.coerce.number().int().min(0).max(3_600).default(45),
    GOOGLE_CALENDAR_PROVIDER_MODE: z
      .enum([WORKER_PROVIDER_MODE.PROVIDER, WORKER_PROVIDER_MODE.NOOP])
      .default(WORKER_PROVIDER_MODE.PROVIDER),
    EMAIL_PROVIDER_MODE: z
      .enum([WORKER_PROVIDER_MODE.PROVIDER, WORKER_PROVIDER_MODE.NOOP])
      .default(WORKER_PROVIDER_MODE.PROVIDER),
    WHATSAPP_PROVIDER_MODE: z
      .enum([WORKER_PROVIDER_MODE.PROVIDER, WORKER_PROVIDER_MODE.NOOP])
      .default(WORKER_PROVIDER_MODE.PROVIDER),
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

    validateProviderMode(
      value.NODE_ENV,
      "GOOGLE_CALENDAR_PROVIDER_MODE",
      value.GOOGLE_CALENDAR_PROVIDER_MODE,
      context
    );
    validateProviderMode(value.NODE_ENV, "EMAIL_PROVIDER_MODE", value.EMAIL_PROVIDER_MODE, context);
    validateProviderMode(
      value.NODE_ENV,
      "WHATSAPP_PROVIDER_MODE",
      value.WHATSAPP_PROVIDER_MODE,
      context
    );

    if (value.GOOGLE_CALENDAR_PROVIDER_MODE === WORKER_PROVIDER_MODE.PROVIDER) {
      validateRequiredConfig(
        [
          "GOOGLE_CALENDAR_CLIENT_ID",
          "GOOGLE_CALENDAR_CLIENT_SECRET",
          "GOOGLE_CALENDAR_REFRESH_TOKEN",
          "GOOGLE_CALENDAR_CALENDAR_ID"
        ],
        value,
        context
      );
    }

    if (value.EMAIL_PROVIDER_MODE === WORKER_PROVIDER_MODE.PROVIDER) {
      validateRequiredConfig(["EMAIL_PROVIDER_API_KEY", "EMAIL_PROVIDER_FROM"], value, context);
    }

    if (value.WHATSAPP_PROVIDER_MODE === WORKER_PROVIDER_MODE.PROVIDER) {
      validateRequiredConfig(
        ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_BUSINESS_ACCOUNT_ID"],
        value,
        context
      );
    }
  });

export type WorkerEnv = z.infer<typeof envSchema>;
export type AppNodeEnv = (typeof APP_NODE_ENV)[keyof typeof APP_NODE_ENV];
export type WorkerRuntimeMode = (typeof PLATFORM_RUNTIME_MODE)[keyof typeof PLATFORM_RUNTIME_MODE];
export type WorkerProviderMode = (typeof WORKER_PROVIDER_MODE)[keyof typeof WORKER_PROVIDER_MODE];

export interface WorkerRuntimeConfig {
  runtimeMode: WorkerRuntimeMode;
  pollIntervalMs: number;
  shutdownGracePeriodMs: number;
  providerModes: {
    googleCalendar: WorkerProviderMode;
    email: WorkerProviderMode;
    whatsapp: WorkerProviderMode;
  };
}

export function parseWorkerEnv(source: NodeJS.ProcessEnv): WorkerEnv {
  const parsed = envSchema.safeParse(source);

  if (parsed.success) {
    return parsed.data;
  }

  throw new InvalidWorkerEnvironmentError(
    parsed.error.issues.map((issue) => ({
      key: issue.path.join(".") || "<root>",
      message: issue.message
    }))
  );
}

export function resolveWorkerRuntimeMode(nodeEnv: AppNodeEnv): WorkerRuntimeMode {
  if (nodeEnv === APP_NODE_ENV.PRODUCTION) {
    return PLATFORM_RUNTIME_MODE.PRODUCTION;
  }

  if (nodeEnv === APP_NODE_ENV.TEST) {
    return PLATFORM_RUNTIME_MODE.TEST;
  }

  return PLATFORM_RUNTIME_MODE.LOCAL;
}

export function resolveWorkerRuntimeConfig(env: WorkerEnv): WorkerRuntimeConfig {
  return {
    runtimeMode: resolveWorkerRuntimeMode(env.NODE_ENV),
    pollIntervalMs: env.WORKER_POLL_INTERVAL_MS,
    shutdownGracePeriodMs: env.WORKER_SHUTDOWN_GRACE_PERIOD_MS,
    providerModes: {
      googleCalendar: env.GOOGLE_CALENDAR_PROVIDER_MODE,
      email: env.EMAIL_PROVIDER_MODE,
      whatsapp: env.WHATSAPP_PROVIDER_MODE
    }
  };
}

function validateProviderMode(
  nodeEnv: AppNodeEnv,
  key: "GOOGLE_CALENDAR_PROVIDER_MODE" | "EMAIL_PROVIDER_MODE" | "WHATSAPP_PROVIDER_MODE",
  value: WorkerProviderMode,
  context: z.RefinementCtx
): void {
  if (nodeEnv === APP_NODE_ENV.PRODUCTION && value === WORKER_PROVIDER_MODE.NOOP) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: [key],
      message: `${key} cannot be noop when NODE_ENV=production`
    });
  }
}

function validateRequiredConfig(
  keys: Array<
    | "GOOGLE_CALENDAR_CLIENT_ID"
    | "GOOGLE_CALENDAR_CLIENT_SECRET"
    | "GOOGLE_CALENDAR_REFRESH_TOKEN"
    | "GOOGLE_CALENDAR_CALENDAR_ID"
    | "EMAIL_PROVIDER_API_KEY"
    | "EMAIL_PROVIDER_FROM"
    | "WHATSAPP_ACCESS_TOKEN"
    | "WHATSAPP_PHONE_NUMBER_ID"
    | "WHATSAPP_BUSINESS_ACCOUNT_ID"
  >,
  env: WorkerEnv,
  context: z.RefinementCtx
): void {
  for (const key of keys) {
    if (!env[key]) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: `${key} is required when its provider mode is set to provider`
      });
    }
  }
}
