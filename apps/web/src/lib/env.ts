import { z } from "zod";

const frontendEnvSchema = z.object({
  NEXT_PUBLIC_API_URL: z.string().url(),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_DEV_LOGIN_ENABLED: z.coerce.boolean()
});

const rawEnv = {
  NEXT_PUBLIC_API_URL:
    process.env.NEXT_PUBLIC_API_URL ??
    process.env.API_URL ??
    process.env.API_BASE_URL ??
    "http://localhost:3311",
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3310",
  NEXT_PUBLIC_DEV_LOGIN_ENABLED: process.env.NEXT_PUBLIC_DEV_LOGIN_ENABLED ?? "false"
};

const parsedEnv = frontendEnvSchema.parse(rawEnv);

export const env = {
  apiUrl: parsedEnv.NEXT_PUBLIC_API_URL,
  appUrl: parsedEnv.NEXT_PUBLIC_APP_URL,
  devLoginEnabled: parsedEnv.NEXT_PUBLIC_DEV_LOGIN_ENABLED
} as const;

export function toApiUrl(pathname: string): string {
  return new URL(pathname, env.apiUrl).toString();
}
