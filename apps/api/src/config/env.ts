import { z } from "zod";

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.string().url().default("postgresql://lia:lia@localhost:5432/lia_clinic"),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    ENABLE_REQUEST_LOGGING: z.coerce.boolean().default(true),
    OIDC_ISSUER: z.string().url(),
    OIDC_CLIENT_ID: z.string().min(1),
    OIDC_CLIENT_SECRET: z.string().min(1),
    OIDC_REDIRECT_URI: z.string().url(),
    OIDC_AUDIENCE: z.string().min(1).optional(),
    OIDC_TENANT_CLAIM: z.string().min(1).default("tenant_id"),
    OIDC_ROLE_CLAIM: z.string().min(1).default("role"),
    SESSION_COOKIE_NAME: z.string().default("lia_session"),
    SESSION_TTL_MINUTES: z.coerce.number().int().positive().default(480)
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV === "test") {
      return;
    }

    if (new URL(value.DATABASE_URL).protocol !== "postgresql:") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["DATABASE_URL"],
        message: "DATABASE_URL must use postgresql:// protocol"
      });
    }

    if (new URL(value.OIDC_ISSUER).protocol !== "https:") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["OIDC_ISSUER"],
        message: "OIDC_ISSUER must use https:// outside tests"
      });
    }

    if (new URL(value.OIDC_REDIRECT_URI).protocol !== "https:") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["OIDC_REDIRECT_URI"],
        message: "OIDC_REDIRECT_URI must use https:// outside tests"
      });
    }
  });

export type AppEnv = z.infer<typeof envSchema>;

export function parseEnv(source: NodeJS.ProcessEnv): AppEnv {
  return envSchema.parse(source);
}
