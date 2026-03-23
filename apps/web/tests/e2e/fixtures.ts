import { test as base, type Route } from "@playwright/test";

import { AuthPage } from "./auth/auth-page";
import {
  AUTH_STORAGE_KEY,
  createDevLoginResponse,
  createPersistedSession,
  createTokenResponse,
  USER_ROLE,
  type UserRole
} from "./helpers";

interface AuthApiFixture {
  getLoginRequestCount: () => number;
  holdCredentialSuccess: (role?: UserRole) => { release: () => void };
  mockCredentialFailure: (message?: string, status?: number) => void;
  mockCredentialSuccess: (role?: UserRole) => void;
}

interface E2EFixtures {
  authApi: AuthApiFixture;
  authPage: AuthPage;
  seedSession: (role: UserRole) => Promise<void>;
}

async function fulfillJson(route: Route, payload: unknown, status = 200): Promise<void> {
  await route.fulfill({
    body: JSON.stringify(payload),
    contentType: "application/json",
    status
  });
}

export const test = base.extend<E2EFixtures>({
  authApi: async ({ page }, use) => {
    let credentialRole: UserRole = USER_ROLE.ADMIN;
    let credentialFailure: { message: string; status: number } | null = null;
    let loginRequestCount = 0;
    let pendingCredentialResponse: Promise<void> | null = null;

    await page.route("**/auth/login", async (route) => {
      loginRequestCount += 1;

      if (credentialFailure) {
        await fulfillJson(route, { message: credentialFailure.message }, credentialFailure.status);
        return;
      }

      if (pendingCredentialResponse) {
        await pendingCredentialResponse;
        pendingCredentialResponse = null;
      }

      await fulfillJson(route, createTokenResponse(credentialRole));
    });

    await page.route("**/auth/refresh", async (route) => {
      await fulfillJson(route, createTokenResponse(credentialRole));
    });

    await page.route("**/auth/logout", async (route) => {
      await fulfillJson(route, { success: true });
    });

    await page.route("**/auth/dev-login*", async (route) => {
      const requestUrl = new URL(route.request().url());
      const role = (requestUrl.searchParams.get("role") as UserRole | null) ?? USER_ROLE.ADMIN;
      await fulfillJson(route, createDevLoginResponse(role));
    });

    await use({
      getLoginRequestCount() {
        return loginRequestCount;
      },
      holdCredentialSuccess(role = USER_ROLE.ADMIN) {
        credentialFailure = null;
        credentialRole = role;

        let release = () => undefined;
        pendingCredentialResponse = new Promise<void>((resolve) => {
          release = () => {
            resolve();
          };
        });

        return { release };
      },
      mockCredentialFailure(message = "Invalid email or password.", status = 401) {
        credentialFailure = { message, status };
      },
      mockCredentialSuccess(role = USER_ROLE.ADMIN) {
        credentialFailure = null;
        credentialRole = role;
      }
    });
  },
  authPage: async ({ page }, use) => {
    await use(new AuthPage(page));
  },
  seedSession: async ({ page }, use) => {
    await use(async (role) => {
      const persistedSession = createPersistedSession(role);

      await page.addInitScript(
        ([storageKey, storageValue]) => {
          window.localStorage.setItem(storageKey, storageValue);
        },
        [AUTH_STORAGE_KEY, persistedSession]
      );
    });
  }
});

export { expect } from "@playwright/test";
