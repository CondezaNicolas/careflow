import type { PlatformRateLimitConfig } from "./platform-config.service.js";

const AUTH_RATE_LIMIT_ROUTE = {
  LOGIN: "login",
  REFRESH: "refresh",
  LOGOUT: "logout",
  DEV_LOGIN: "dev-login"
} as const;

export type AuthRateLimitRoute = (typeof AUTH_RATE_LIMIT_ROUTE)[keyof typeof AUTH_RATE_LIMIT_ROUTE];

export interface RouteRateLimitPolicy {
  maxRequests: number;
  path: `/${string}`;
  route: AuthRateLimitRoute;
}

const AUTH_ROUTE_PATHS = new Set<string>([
  "/auth/login",
  "/auth/refresh",
  "/auth/logout",
  "/auth/dev-login"
]);

export function buildAuthRouteRateLimitPolicies(
  config: PlatformRateLimitConfig
): RouteRateLimitPolicy[] {
  return [
    {
      route: AUTH_RATE_LIMIT_ROUTE.LOGIN,
      path: "/auth/login",
      maxRequests: config.auth.loginMaxRequests
    },
    {
      route: AUTH_RATE_LIMIT_ROUTE.REFRESH,
      path: "/auth/refresh",
      maxRequests: config.auth.refreshMaxRequests
    },
    {
      route: AUTH_RATE_LIMIT_ROUTE.LOGOUT,
      path: "/auth/logout",
      maxRequests: config.auth.logoutMaxRequests
    },
    {
      route: AUTH_RATE_LIMIT_ROUTE.DEV_LOGIN,
      path: "/auth/dev-login",
      maxRequests: config.auth.devLoginMaxRequests
    }
  ];
}

export function isAuthRateLimitedPath(pathname: string): boolean {
  return AUTH_ROUTE_PATHS.has(normalizePath(pathname));
}

export function createRateLimitMessage(route: AuthRateLimitRoute): string {
  return `Too many requests for auth.${route}`;
}

function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }

  return pathname;
}
