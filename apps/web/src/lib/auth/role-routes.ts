import type { UserRole } from "@/features/auth/auth.types";
import { APP_ROUTE } from "@/lib/routes";

export const ROLE_ROUTE = {
  admin: APP_ROUTE.ADMIN,
  clinician: APP_ROUTE.CLINICIAN,
  receptionist: APP_ROUTE.RECEPTIONIST,
  patient: APP_ROUTE.PATIENT
} as const satisfies Record<UserRole, string>;

export const ROLE_LABEL = {
  admin: "Admin",
  clinician: "Clinician",
  receptionist: "Receptionist",
  patient: "Patient"
} as const satisfies Record<UserRole, string>;

export function getRoleLandingRoute(role: UserRole): string {
  return ROLE_ROUTE[role];
}

export function getRoleLabel(role: UserRole): string {
  return ROLE_LABEL[role];
}

export function getRoleFromPathname(pathname: string): UserRole | null {
  for (const [role, route] of Object.entries(ROLE_ROUTE) as Array<[UserRole, string]>) {
    if (pathname === route || pathname.startsWith(`${route}/`)) {
      return role;
    }
  }

  return null;
}

export function isAuthorizedRolePath(pathname: string, role: UserRole): boolean {
  const requestedRole = getRoleFromPathname(pathname);

  if (!requestedRole) {
    return true;
  }

  return requestedRole === role;
}
