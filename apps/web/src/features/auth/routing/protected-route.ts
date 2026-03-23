import type { AuthStateEvent, PersistedAuthSession } from "@/features/auth/auth.types";
import { AUTH_STATE_EVENT } from "@/features/auth/auth.types";
import { getRoleFromPathname, getRoleLandingRoute } from "@/lib/auth/role-routes";
import { APP_ROUTE } from "@/lib/routes";

export const LOGIN_REDIRECT_REASON = {
  LOGIN_REQUIRED: "login-required",
  SESSION_EXPIRED: "session-expired",
  SIGNED_OUT: "signed-out"
} as const;

export type LoginRedirectReason =
  (typeof LOGIN_REDIRECT_REASON)[keyof typeof LOGIN_REDIRECT_REASON];

interface ProtectedRouteInput {
  authEvent: AuthStateEvent | null;
  isReady: boolean;
  pathname: string;
  session: PersistedAuthSession | null;
}

interface LoadingResolution {
  kind: "loading";
  message: string;
}

interface AllowResolution {
  kind: "allow";
}

interface RedirectResolution {
  kind: "redirect-login" | "redirect-role";
  href: string;
  message: string;
}

export type ProtectedRouteResolution = AllowResolution | LoadingResolution | RedirectResolution;

export function getLoginRedirectReason(authEvent: AuthStateEvent | null): LoginRedirectReason {
  if (authEvent === AUTH_STATE_EVENT.SESSION_EXPIRED) {
    return LOGIN_REDIRECT_REASON.SESSION_EXPIRED;
  }

  if (authEvent === AUTH_STATE_EVENT.SIGNED_OUT) {
    return LOGIN_REDIRECT_REASON.SIGNED_OUT;
  }

  return LOGIN_REDIRECT_REASON.LOGIN_REQUIRED;
}

export function buildLoginRoute(reason: LoginRedirectReason): string {
  const searchParams = new URLSearchParams({ reason });
  return `${APP_ROUTE.LOGIN}?${searchParams.toString()}`;
}

export function getAuthEventMessage(authEvent: AuthStateEvent | null): string | null {
  if (authEvent === AUTH_STATE_EVENT.SESSION_EXPIRED) {
    return "Your session expired, so we brought you back to sign in again.";
  }

  if (authEvent === AUTH_STATE_EVENT.SIGNED_OUT) {
    return "You signed out cleanly. Sign back in whenever you are ready.";
  }

  return null;
}

export function resolveProtectedRoute({
  authEvent,
  isReady,
  pathname,
  session
}: ProtectedRouteInput): ProtectedRouteResolution {
  if (!isReady) {
    return {
      kind: "loading",
      message: "Restoring your secure workspace..."
    };
  }

  if (!session) {
    return {
      kind: "redirect-login",
      href: buildLoginRoute(getLoginRedirectReason(authEvent)),
      message:
        getAuthEventMessage(authEvent) ?? "You need an active session to open this workspace."
    };
  }

  const requestedRole = getRoleFromPathname(pathname);

  if (requestedRole && requestedRole !== session.principal.role) {
    return {
      kind: "redirect-role",
      href: getRoleLandingRoute(session.principal.role),
      message: "That route belongs to another role, so we are sending you to your workspace."
    };
  }

  return { kind: "allow" };
}
