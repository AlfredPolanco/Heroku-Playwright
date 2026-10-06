import { test as base, expect } from '@playwright/test';

import { CheckboxesPage } from '../pages/checkboxes.page';
import { DynamicLoadingPage } from '../pages/dynamic-loading.page';
import { LoginPage } from '../pages/login.page';
import { SecureAreaPage } from '../pages/secure-area.page';

/**
 * Page objects exposed to specs as fixtures, so no spec ever writes `new`.
 *
 * Fixtures are lazy: a spec only pays for the page objects it actually
 * destructures, and each test gets a fresh instance bound to its own `page`.
 */
export interface PageFixtures {
  loginPage: LoginPage;
  secureAreaPage: SecureAreaPage;
  dynamicLoadingPage: DynamicLoadingPage;
  checkboxesPage: CheckboxesPage;
}

export const test = base.extend<PageFixtures>({
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },
  secureAreaPage: async ({ page }, use) => {
    await use(new SecureAreaPage(page));
  },
  dynamicLoadingPage: async ({ page }, use) => {
    await use(new DynamicLoadingPage(page));
  },
  checkboxesPage: async ({ page }, use) => {
    await use(new CheckboxesPage(page));
  },
});

// Re-exported so specs have a single import for both `test` and `expect`.
export { expect };
