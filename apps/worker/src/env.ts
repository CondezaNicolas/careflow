import { z } from "zod";

const APP_NODE_ENV = {
  DEVELOPMENT: "development",
  TEST: "test",
  PRODUCTION: "production"
} as const;

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
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url(),
    GOOGLE_CALENDAR_MAX_RETRIES: z.coerce.number().int().positive().max(10).default(5),
    GOOGLE_CALENDAR_BACKOFF_SECONDS: z.coerce.number().int().min(0).max(3_600).default(30),
    NOTIFICATIONS_MAX_RETRIES: z.coerce.number().int().positive().max(10).default(4),
    NOTIFICATIONS_BACKOFF_SECONDS: z.coerce.number().int().min(0).max(3_600).default(45)
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

    if (new URL(value.REDIS_URL).protocol !== "redis:") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["REDIS_URL"],
        message: "REDIS_URL must use redis:// protocol"
      });
    }
  });

export type WorkerEnv = z.infer<typeof envSchema>;

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
