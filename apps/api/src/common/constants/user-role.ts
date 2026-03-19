export const USER_ROLE = {
  ADMIN: "admin",
  CLINICIAN: "clinician",
  RECEPTIONIST: "receptionist",
  PATIENT: "patient"
} as const;

export type UserRole = (typeof USER_ROLE)[keyof typeof USER_ROLE];
