import { expect, type Locator, type Page } from "@playwright/test";

import { BasePage } from "../base-page";
import { ROLE_MATRIX, type UserRole } from "../helpers";

export class AuthPage extends BasePage {
  readonly adminBreadcrumbs: Locator;
  readonly adminCreateUserButton: Locator;
  readonly adminDashboardLink: Locator;
  readonly adminHeader: Locator;
  readonly adminMobileMenuButton: Locator;
  readonly adminProfileTrigger: Locator;
  readonly adminSearchInput: Locator;
  readonly adminSidebar: Locator;
  readonly adminSystemStatus: Locator;
  readonly adminWorkspace: Locator;
  readonly devLoginPage: Locator;
  readonly devLoginShortcuts: Locator;
  readonly footer: Locator;
  readonly emailInput: Locator;
  readonly heroSection: Locator;
  readonly loginForm: Locator;
  readonly loginPanel: Locator;
  readonly passwordInput: Locator;
  readonly signInButton: Locator;
  readonly logoutButton: Locator;

  constructor(page: Page) {
    super(page);
    this.adminBreadcrumbs = page.getByLabel("Admin breadcrumb");
    this.adminCreateUserButton = page.getByRole("button", { name: /Nuevo Usuario/i });
    this.adminDashboardLink = page.getByRole("link", { name: "Dashboard" });
    this.adminHeader = page.getByLabel("Admin workspace header");
    this.adminMobileMenuButton = page.getByRole("button", {
      name: /^(Open navigation|Close navigation)$/i
    });
    this.adminProfileTrigger = page.getByRole("button", { name: /Open profile menu/i });
    this.adminSearchInput = page.getByPlaceholder(/Buscar usuarios, pacientes, turnos, logs/i);
    this.adminSidebar = page.getByLabel("Admin navigation shell");
    this.adminSystemStatus = page.getByLabel("System status");
    this.adminWorkspace = page.locator(".admin-workspace");
    this.devLoginPage = page.getByLabel("Development login page");
    this.devLoginShortcuts = page.getByLabel("Development login shortcuts");
    this.footer = page.getByRole("contentinfo");
    this.emailInput = page.getByLabel("Correo Electronico");
    this.heroSection = page.getByLabel("Clinic login overview");
    this.loginForm = page.locator("form.login-form");
    this.loginPanel = page.getByLabel("Login panel");
    this.passwordInput = page.getByLabel(/^Contrasena$/i);
    this.signInButton = page.getByRole("button", {
      name: /^(Sign in|Signing in|Iniciar Sesion|Iniciando sesion)/i
    });
    this.logoutButton = page.getByRole("button", { name: /^(Logout|Cerrar sesion)$/i }).first();
  }

  async gotoLogin(): Promise<void> {
    await this.goto("/login");
  }

  async gotoDevLogin(): Promise<void> {
    await this.goto("/dev-login");
  }

  async gotoRoot(): Promise<void> {
    await this.goto("/");
  }

  async gotoWorkspace(role: UserRole): Promise<void> {
    await this.goto(ROLE_MATRIX[role].route);
  }

  async fillCredentials(email: string, password: string): Promise<void> {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
  }

  async signIn(email: string, password: string): Promise<void> {
    await this.fillCredentials(email, password);
    await this.signInButton.click();
  }

  async submitLoginFormTwice(): Promise<void> {
    await this.loginForm.evaluate((form) => {
      if (!(form instanceof HTMLFormElement)) {
        throw new Error("Expected the login form element.");
      }

      form.requestSubmit();
      form.requestSubmit();
    });
  }

  async signInWithDevShortcut(role: UserRole): Promise<void> {
    await this.page
      .getByRole("button", { name: new RegExp(`^${ROLE_MATRIX[role].buttonLabel}\\b`) })
      .click();
  }

  async expectRoleWorkspace(role: UserRole): Promise<void> {
    await this.expectPathname(ROLE_MATRIX[role].route);
    await expect(this.page.getByRole("heading", { name: ROLE_MATRIX[role].heading })).toBeVisible();
    await expect(this.logoutButton).toBeVisible();
  }

  async clickAdminDashboardNav(): Promise<void> {
    await this.adminDashboardLink.click();
  }

  async expectAdminSidebarState(state: "collapsed" | "expanded"): Promise<void> {
    await expect(this.adminSidebar).toHaveAttribute("data-sidebar-state", state);
  }

  async toggleAdminMobileNavigation(): Promise<void> {
    await this.adminMobileMenuButton.click();
  }

  async expectAdminMobileNavigation(state: "open" | "closed"): Promise<void> {
    await expect(this.adminWorkspace).toHaveAttribute("data-mobile-nav", state);
  }

  async expectLoginRedirect(reason: string): Promise<void> {
    await expect(this.page).toHaveURL(new RegExp(`/login\\?reason=${reason}$`));
    await expect(this.page.getByRole("heading", { name: /Acceso CareFlow/i })).toBeVisible();
  }

  async expectAuthError(message: string): Promise<void> {
    await expect(this.page.locator(".login-error")).toContainText(message);
  }

  async expectSignedOutNotice(): Promise<void> {
    await expect(
      this.page.getByText("You signed out cleanly. Sign back in whenever you are ready.")
    ).toBeVisible();
  }

  async logout(): Promise<void> {
    await this.logoutButton.click();
  }

  async toggleAdminSidebarFromBackground(): Promise<void> {
    await this.adminSidebar.click({ position: { x: 10, y: 320 } });
  }

  async expectNoHorizontalOverflow(): Promise<void> {
    const hasOverflow = await this.page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });

    expect(hasOverflow).toBe(false);
  }

  async expectNoVerticalOverflow(): Promise<void> {
    const hasOverflow = await this.page.evaluate(() => {
      return document.documentElement.scrollHeight > window.innerHeight;
    });

    expect(hasOverflow).toBe(false);
  }

  async expectMainLoginWithoutDevShortcuts(): Promise<void> {
    await expect(this.devLoginShortcuts).toHaveCount(0);
  }

  async expectPanelBeforeHero(): Promise<void> {
    const panelBox = await this.loginPanel.boundingBox();
    const heroBox = await this.heroSection.boundingBox();

    expect(panelBox).not.toBeNull();
    expect(heroBox).not.toBeNull();

    expect(panelBox!.y).toBeLessThan(heroBox!.y);
  }
}
