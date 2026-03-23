import { expect, test } from "../fixtures";
import { ROLE_LIST, ROLE_MATRIX, USER_ROLE } from "../helpers";

test.describe("Authentication", () => {
  test(
    "unauthenticated protected routes bounce back to login",
    { tag: ["@critical", "@e2e", "@auth", "@AUTH-E2E-001"] },
    async ({ authPage }) => {
      await authPage.gotoWorkspace(USER_ROLE.ADMIN);

      await authPage.expectLoginRedirect("login-required");
    }
  );

  test(
    "credential login lands on the matching role workspace",
    { tag: ["@critical", "@e2e", "@auth", "@AUTH-E2E-002"] },
    async ({ authApi, authPage }) => {
      authApi.mockCredentialSuccess(USER_ROLE.CLINICIAN);

      await authPage.gotoLogin();
      await authPage.signIn(ROLE_MATRIX.clinician.email, "password123");

      await authPage.expectRoleWorkspace(USER_ROLE.CLINICIAN);
    }
  );

  test(
    "dev-login shortcuts move to the dedicated development route and keep role access working",
    { tag: ["@high", "@e2e", "@auth", "@AUTH-E2E-005"] },
    async ({ authApi, authPage }) => {
      authApi.mockCredentialSuccess(USER_ROLE.PATIENT);

      await authPage.gotoDevLogin();

      await authPage.expectPathname("/dev-login");
      await expect(authPage.devLoginPage).toBeVisible();
      await authPage.signInWithDevShortcut(USER_ROLE.PATIENT);

      await authPage.expectRoleWorkspace(USER_ROLE.PATIENT);
    }
  );

  test(
    "invalid credentials keep the operator on login with feedback",
    { tag: ["@high", "@e2e", "@auth", "@AUTH-E2E-003"] },
    async ({ authApi, authPage }) => {
      authApi.mockCredentialFailure();

      await authPage.gotoLogin();
      await authPage.signIn("wrong@lia.test", "bad-password");

      await authPage.expectPathname("/login");
      await authPage.expectAuthError("Invalid email or password.");
    }
  );

  test(
    "duplicate credential submits stay single-flight in the rendered login form",
    { tag: ["@high", "@e2e", "@auth", "@AUTH-E2E-006"] },
    async ({ authApi, authPage }) => {
      const pendingLogin = authApi.holdCredentialSuccess(USER_ROLE.ADMIN);

      await authPage.gotoLogin();
      await authPage.fillCredentials(ROLE_MATRIX.admin.email, "password123");
      await authPage.submitLoginFormTwice();

      await expect(authPage.signInButton).toBeDisabled();
      await expect(authPage.signInButton).toHaveText(/Iniciando sesion/i);
      expect(authApi.getLoginRequestCount()).toBe(1);

      pendingLogin.release();

      await authPage.expectRoleWorkspace(USER_ROLE.ADMIN);
      expect(authApi.getLoginRequestCount()).toBe(1);
    }
  );

  for (const role of ROLE_LIST) {
    test(
      `seeded ${role} sessions open the correct workspace and sign out cleanly`,
      { tag: ["@critical", "@e2e", "@auth", `@AUTH-E2E-${role.toUpperCase()}`] },
      async ({ authPage, seedSession }) => {
        await seedSession(role);
        await authPage.gotoWorkspace(role);

        await authPage.expectRoleWorkspace(role);

        await authPage.logout();
        await authPage.expectLoginRedirect("signed-out");
        await authPage.expectSignedOutNotice();
      }
    );
  }

  test(
    "persisted sessions reopen the matching workspace from the root route",
    { tag: ["@high", "@e2e", "@auth", "@AUTH-E2E-004"] },
    async ({ authPage, seedSession }) => {
      await seedSession(USER_ROLE.RECEPTIONIST);

      await authPage.gotoRoot();

      await authPage.expectRoleWorkspace(USER_ROLE.RECEPTIONIST);
      await expect(authPage.logoutButton).toBeVisible();
    }
  );

  test(
    "authenticated users are redirected away from the login route",
    { tag: ["@high", "@e2e", "@auth", "@AUTH-E2E-007"] },
    async ({ authPage, seedSession }) => {
      await seedSession(USER_ROLE.CLINICIAN);

      await authPage.gotoLogin();

      await authPage.expectRoleWorkspace(USER_ROLE.CLINICIAN);
    }
  );

  test.describe("admin workspace shell", () => {
    test.use({ viewport: { width: 1440, height: 960 } });

    test(
      "admin workspace uses the collapsible shell without bubbling nav clicks into toggles",
      { tag: ["@high", "@e2e", "@auth", "@AUTH-E2E-011"] },
      async ({ authPage, seedSession }) => {
        await seedSession(USER_ROLE.ADMIN);
        await authPage.gotoWorkspace(USER_ROLE.ADMIN);

        await authPage.expectRoleWorkspace(USER_ROLE.ADMIN);
        await expect(authPage.adminSidebar).toBeVisible();
        await authPage.expectAdminSidebarState("expanded");

        await authPage.clickAdminDashboardNav();
        await authPage.expectAdminSidebarState("expanded");

        await authPage.toggleAdminSidebarFromBackground();
        await authPage.expectAdminSidebarState("collapsed");

        await authPage.toggleAdminSidebarFromBackground();
        await authPage.expectAdminSidebarState("expanded");
      }
    );

    test(
      "admin header keeps the Stitch-inspired controls visible on desktop",
      { tag: ["@high", "@e2e", "@auth", "@AUTH-E2E-012"] },
      async ({ authPage, seedSession }) => {
        await seedSession(USER_ROLE.ADMIN);
        await authPage.gotoWorkspace(USER_ROLE.ADMIN);

        await authPage.expectRoleWorkspace(USER_ROLE.ADMIN);
        await expect(authPage.adminHeader).toBeVisible();
        await expect(authPage.adminBreadcrumbs).toContainText("Monitor de Dashboard");
        await expect(authPage.adminSystemStatus).toBeVisible();
        await expect(authPage.adminSearchInput).toBeVisible();
        await expect(authPage.adminCreateUserButton).toBeVisible();
        await expect(authPage.adminProfileTrigger).toBeVisible();
        await authPage.expectNoHorizontalOverflow();
      }
    );
  });

  test.describe("responsive admin header", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test(
      "mobile admin keeps the header controls usable with the drawer shell",
      { tag: ["@high", "@e2e", "@auth", "@AUTH-E2E-013"] },
      async ({ authPage, seedSession }) => {
        await seedSession(USER_ROLE.ADMIN);
        await authPage.gotoWorkspace(USER_ROLE.ADMIN);

        await authPage.expectRoleWorkspace(USER_ROLE.ADMIN);
        await expect(authPage.adminHeader).toBeVisible();
        await expect(authPage.adminSearchInput).toBeVisible();
        await expect(authPage.adminCreateUserButton).toBeVisible();
        await authPage.expectNoHorizontalOverflow();

        await authPage.toggleAdminMobileNavigation();
        await authPage.expectAdminMobileNavigation("open");

        await authPage.toggleAdminMobileNavigation();
        await authPage.expectAdminMobileNavigation("closed");
      }
    );
  });

  test.describe("responsive login layout", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test(
      "small mobile keeps the login panel readable without horizontal overflow",
      { tag: ["@high", "@e2e", "@auth", "@AUTH-E2E-008"] },
      async ({ authPage }) => {
        await authPage.gotoLogin();

        await authPage.expectNoHorizontalOverflow();
        await authPage.expectPanelBeforeHero();
        await expect(authPage.signInButton).toBeVisible();
        await expect(authPage.footer).toBeVisible();
      }
    );
  });

  test.describe("tablet login layout", () => {
    test.use({ viewport: { width: 820, height: 1180 } });

    test(
      "tablet keeps supporting hero content visible while prioritizing the form",
      { tag: ["@high", "@e2e", "@auth", "@AUTH-E2E-009"] },
      async ({ authPage }) => {
        await authPage.gotoLogin();

        await authPage.expectNoHorizontalOverflow();
        await authPage.expectNoVerticalOverflow();
        await authPage.expectPanelBeforeHero();
        await expect(authPage.heroSection).toBeVisible();
        await expect(authPage.footer).toBeVisible();
      }
    );
  });

  test.describe("desktop login layout", () => {
    test.use({ viewport: { width: 1440, height: 960 } });

    test(
      "desktop keeps the main login route locked to the viewport without page scroll",
      { tag: ["@high", "@e2e", "@auth", "@AUTH-E2E-010"] },
      async ({ authPage }) => {
        await authPage.gotoLogin();

        await authPage.expectNoHorizontalOverflow();
        await authPage.expectNoVerticalOverflow();
        await expect(authPage.heroSection).toBeVisible();
        await expect(authPage.footer).toBeVisible();
      }
    );
  });
});
