import { expect, test } from '../fixtures/pages.fixture';
import {
  FAILED_LOGIN_CASES,
  FLASH_MESSAGES,
  SUCCESSFUL_LOGIN_CASES,
  VALID_CREDENTIALS,
} from '../test-data/credentials';

test.describe('Login', () => {
  test.beforeEach(async ({ loginPage }) => {
    await loginPage.goto();
  });

  // One test per data row, titled from the case so a failure in CI names the
  // exact scenario. Both loops are branch-free: every assertion in a given
  // test body always runs.
  for (const { title, credentials, expectedPath } of SUCCESSFUL_LOGIN_CASES) {
    test(`logging in with ${title} reaches the secure area`, async ({
      page,
      loginPage,
      secureAreaPage,
    }) => {
      await loginPage.login(credentials);

      await expect(page).toHaveURL(new RegExp(`${expectedPath}$`));
      await expect(secureAreaPage.flashMessage).toBeVisible();
      await expect(secureAreaPage.flashMessage).toContainText(FLASH_MESSAGES.loginSucceeded);
      await expect(secureAreaPage.logoutLink).toBeVisible();
    });
  }

  for (const { title, credentials, expectedError } of FAILED_LOGIN_CASES) {
    test(`logging in with ${title} is rejected on the login page`, async ({ page, loginPage }) => {
      await loginPage.login(credentials);

      await expect(page).toHaveURL(/\/login$/);
      await expect(loginPage.flashMessage).toBeVisible();
      // toContainText, not toHaveText: the flash element also holds a "×"
      // dismiss link, so its full text is e.g. "Your username is invalid!\n×".
      await expect(loginPage.flashMessage).toContainText(expectedError);
      await expect(loginPage.loginButton).toBeVisible();
    });
  }

  test('logging out returns the user to the login page with a confirmation', async ({
    page,
    loginPage,
    secureAreaPage,
  }) => {
    await loginPage.login(VALID_CREDENTIALS);
    await expect(secureAreaPage.heading).toBeVisible();

    await secureAreaPage.logout();

    await expect(page).toHaveURL(/\/login$/);
    await expect(loginPage.flashMessage).toContainText(FLASH_MESSAGES.logoutSucceeded);
    await expect(loginPage.loginButton).toBeVisible();
  });
});
