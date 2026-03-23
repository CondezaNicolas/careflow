export const APP_ROUTE = {
  ROOT: "/",
  LOGIN: "/login",
  DEV_LOGIN: "/dev-login",
  ADMIN: "/admin",
  CLINICIAN: "/clinician",
  RECEPTIONIST: "/receptionist",
  PATIENT: "/patient"
} as const;

export type AppRoute = (typeof APP_ROUTE)[keyof typeof APP_ROUTE];

export const PUBLIC_ROUTE_SET = new Set<AppRoute>([
  APP_ROUTE.ROOT,
  APP_ROUTE.LOGIN,
  APP_ROUTE.DEV_LOGIN
]);

export function isPublicRoute(route: string): boolean {
  return PUBLIC_ROUTE_SET.has(route as AppRoute);
}
