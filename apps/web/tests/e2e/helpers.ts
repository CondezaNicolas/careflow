export const USER_ROLE = {
  ADMIN: "admin",
  CLINICIAN: "clinician",
  RECEPTIONIST: "receptionist",
  PATIENT: "patient"
} as const;

export type UserRole = (typeof USER_ROLE)[keyof typeof USER_ROLE];

export const ROLE_MATRIX = {
  admin: {
    buttonLabel: "Admin",
    email: "admin@lia.test",
    heading: "Dashboard",
    route: "/admin"
  },
  clinician: {
    buttonLabel: "Clinician",
    email: "clinician@lia.test",
    heading: "Clinician command center",
    route: "/clinician"
  },
  receptionist: {
    buttonLabel: "Receptionist",
    email: "receptionist@lia.test",
    heading: "Receptionist command center",
    route: "/receptionist"
  },
  patient: {
    buttonLabel: "Patient",
    email: "patient@lia.test",
    heading: "Patient command center",
    route: "/patient"
  }
} as const satisfies Record<
  UserRole,
  {
    buttonLabel: string;
    email: string;
    heading: string;
    route: string;
  }
>;

export const ROLE_LIST = Object.values(USER_ROLE);
export const AUTH_STORAGE_KEY = "lia-clinic.auth-session";

function encodeBase64Url(value: string): string {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function createJwt(role: UserRole): string {
  const nowInSeconds = Math.floor(Date.now() / 1000);
  const email = ROLE_MATRIX[role].email;

  return [
    encodeBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" })),
    encodeBase64Url(
      JSON.stringify({
        sub: `${role}-user`,
        email,
        exp: nowInSeconds + 900,
        iat: nowInSeconds,
        role,
        tenantId: "tenant-local"
      })
    ),
    "signature"
  ].join(".");
}

export function createTokenResponse(role: UserRole) {
  return {
    accessToken: createJwt(role),
    expiresIn: 900,
    refreshToken: `${role}-refresh-token`
  };
}

export function createDevLoginResponse(role: UserRole) {
  return {
    accessToken: createJwt(role),
    redirectUrl: ROLE_MATRIX[role].route,
    role,
    success: true
  };
}

export function createPersistedSession(role: UserRole): string {
  return JSON.stringify({
    state: {
      session: {
        accessToken: createJwt(role),
        accessTokenExpiresAt: Date.now() + 15 * 60 * 1000,
        principal: {
          email: ROLE_MATRIX[role].email,
          id: `${role}-user`,
          role,
          tenantId: "tenant-local"
        },
        refreshToken: `${role}-refresh-token`
      },
      status: "authenticated"
    },
    version: 0
  });
}
