import { ForbiddenException } from "@nestjs/common";

import { USER_ROLE, type UserRole } from "../constants/user-role.js";

const CLINICAL_WRITE_ALLOWED = {
  [USER_ROLE.ADMIN]: true,
  [USER_ROLE.CLINICIAN]: true,
  [USER_ROLE.RECEPTIONIST]: false,
  [USER_ROLE.PATIENT]: false
} as const;

export function requireClinicalWritePermission(role: UserRole): void {
  if (!CLINICAL_WRITE_ALLOWED[role]) {
    throw new ForbiddenException("Role cannot modify clinical content");
  }
}
