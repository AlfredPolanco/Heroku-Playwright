import type { Locator, Page } from '@playwright/test';

import type { Credentials } from '../test-data/credentials';
import { BasePage } from './base.page';

/** The /login form. */
export class LoginPage extends BasePage {
  static readonly path = '/login';

  readonly usernameInput: Locator;
  readonly passwordInput: Locator;
  readonly loginButton: Locator;

  constructor(page: Page) {
    super(page);
    // Both inputs have real <label for="..."> elements, so getByLabel is the
    // user-facing locator here. The submit control's accessible name comes from
    // the nested <i> text ("Login").
    this.usernameInput = page.getByLabel('Username');
    this.passwordInput = page.getByLabel('Password');
    this.loginButton = page.getByRole('button', { name: 'Login' });
  }

  async goto(): Promise<void> {
    await this.navigate(LoginPage.path);
  }

  /**
   * Fills the form and submits it.
   *
   * `fill('')` is a no-op that still clears the field, which keeps the
   * empty-credentials case on the same code path as every other case.
   */
  async login({ username, password }: Credentials): Promise<void> {
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
  }
}
