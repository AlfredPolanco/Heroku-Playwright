import type { Locator, Page } from '@playwright/test';

import { BasePage } from './base.page';

/** The /secure page reached after a successful login. */
export class SecureAreaPage extends BasePage {
  static readonly path = '/secure';

  readonly heading: Locator;

  /**
   * The app styles this as a button but renders `<a href="/logout">`, so its
   * accessible role is `link`. Asserting the real role keeps the test honest;
   * using `getByRole('button')` here would simply never match.
   */
  readonly logoutLink: Locator;

  constructor(page: Page) {
    super(page);
    // `exact: true` is required, not decorative: the page's subheader reads
    // "Welcome to the Secure Area...", so a substring match resolves to two
    // headings and trips Playwright's strict mode.
    this.heading = page.getByRole('heading', { name: 'Secure Area', exact: true });
    this.logoutLink = page.getByRole('link', { name: 'Logout' });
  }

  async logout(): Promise<void> {
    await this.logoutLink.click();
  }
}
