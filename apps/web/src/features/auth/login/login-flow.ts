import { AuthApiError } from "@/features/auth/api/auth-client";
import type {
  DevLoginInput,
  LoginInput,
  PersistedAuthSession,
  UserRole
} from "@/features/auth/auth.types";
import { getRoleLandingRoute } from "@/lib/auth/role-routes";

export const LOGIN_SUBMISSION = {
  CREDENTIALS: "credentials",
  DEV_LOGIN: "dev-login"
} as const;

export type LoginSubmission = (typeof LOGIN_SUBMISSION)[keyof typeof LOGIN_SUBMISSION];

interface CredentialLoginDependencies {
  login: (input: LoginInput) => Promise<PersistedAuthSession>;
  navigate: (href: string) => void;
}

interface DevRoleLoginDependencies {
  devLogin: (input?: DevLoginInput) => Promise<PersistedAuthSession>;
  navigate: (href: string) => void;
}

export function getLoginErrorMessage(error: unknown): string {
  if (error instanceof AuthApiError) {
    return error.message;
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Unable to sign in right now. Try again.";
}

export async function submitCredentialLogin(
  input: LoginInput,
  dependencies: CredentialLoginDependencies
): Promise<string> {
  const session = await dependencies.login(input);
  const redirectTo = getRoleLandingRoute(session.principal.role);

  dependencies.navigate(redirectTo);
  return redirectTo;
}

export async function submitDevRoleLogin(
  role: UserRole,
  dependencies: DevRoleLoginDependencies
): Promise<string> {
  const redirectTo = getRoleLandingRoute(role);
  const session = await dependencies.devLogin({ role, redirect: redirectTo });
  const resolvedRedirect = getRoleLandingRoute(session.principal.role);

  dependencies.navigate(resolvedRedirect);
  return resolvedRedirect;
}

export function createSingleFlightRunner() {
  let inFlight = false;

  return async function run<T>(task: () => Promise<T>): Promise<T | null> {
    if (inFlight) {
      return null;
    }

    inFlight = true;

    try {
      return await task();
    } finally {
      inFlight = false;
    }
  };
}
