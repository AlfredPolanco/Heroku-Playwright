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
  /** Auto-applied; see `trimAssets` below. Not consumed by specs directly. */
  trimAssets: void;
}

/** Escape hatch: `LOAD_ALL_ASSETS=1 npm test` restores full-fidelity loading. */
const loadAllAssets = process.env.LOAD_ALL_ASSETS === '1';

/**
 * Scripts the pages under test provably do not need. jQuery is NOT in this
 * list -- the dynamic-loading pages depend on it.
 *  - 298279967.js: a ~132KB third-party/analytics bundle
 *  - jquery-ui: unused by any page under test
 *  - foundation(.alerts).js: only powers the flash dismiss "x", never clicked
 */
const UNUSED_SCRIPTS = /298279967\.js|jquery-ui|foundation(\.alerts)?\.js/;

export const test = base.extend<PageFixtures>({
  /**
   * Drops subresources no assertion depends on.
   *
   * WHY: each test gets a fresh browser context, so every page load refetches
   * the full asset set cold -- ~380KB of it stylesheets (app.css alone is
   * 353KB). The target is a free shared Heroku dyno that cannot reliably serve
   * that. Measured over 8 cold-cache navigations while the app was degraded:
   *
   *   no blocking .................. 1/8 succeeded (avg 2367ms)
   *   images/fonts/unused scripts ... 3/8 succeeded (avg 1481ms)
   *   + stylesheets ................ 8/8 succeeded (avg  708ms)
   *
   * Stylesheets are the decisive factor, so they are dropped too.
   *
   * THE TRADE-OFF, STATED PLAINLY: with CSS dropped, `toBeVisible()` no longer
   * reflects stylesheet-driven visibility. That is sound *for these pages* --
   * every show/hide under test is driven by inline styles that jQuery sets
   * (`#finish` ships with `style='display:none'`; `#loading` is hidden via
   * `.hide()`), which this suite still verifies exactly. It would NOT be sound
   * on a page that hides things via a CSS class, and this fixture should be
   * revisited before covering one. Use LOAD_ALL_ASSETS=1 to opt out.
   */
  trimAssets: [
    async ({ context }, use) => {
      if (!loadAllAssets) {
        await context.route('**/*', (route) => {
          const type = route.request().resourceType();
          const isDecorative =
            type === 'image' || type === 'font' || type === 'media' || type === 'stylesheet';

          return isDecorative || UNUSED_SCRIPTS.test(route.request().url())
            ? route.abort()
            : route.continue();
        });
      }
      await use();
    },
    { auto: true },
  ],

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
