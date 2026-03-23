import { expect, type Page } from "@playwright/test";

export class BasePage {
  constructor(protected readonly page: Page) {}

  async goto(pathname: string): Promise<void> {
    await this.page.goto(pathname);
  }

  async expectPathname(pathname: string): Promise<void> {
    await expect(this.page).toHaveURL(
      new RegExp(`${pathname.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`)
    );
  }
}
