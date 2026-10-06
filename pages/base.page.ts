import type { Locator, Page } from '@playwright/test';

/**
 * Shared behaviour for every page object.
 *
 * Deliberately thin -- it exists for two pieces of genuine reuse:
 *  - `navigate()`, so no page object repeats relative-path navigation, and
 *  - `flashMessage`, the app-wide notification banner (`#flash`) that both
 *    /login and /secure render.
 *
 * It does not try to be a generic "actions" wrapper; Playwright's `Locator`
 * API is already the right abstraction for that.
 */
export abstract class BasePage {
  /**
   * The app renders notifications into `#flash`. There is no landmark, heading
   * or ARIA role on this element, so an id selector is the only stable handle
   * the app offers.
   */
  readonly flashMessage: Locator;

  protected constructor(readonly page: Page) {
    this.flashMessage = page.locator('#flash');
  }

  /**
   * Navigates to a path relative to the configured `baseURL`.
   *
   * `domcontentloaded` rather than Playwright's default `load`: the target is a
   * free shared host that frequently dribbles out its decorative assets (the
   * fork-me PNG, font-awesome, jQuery UI), and `load` blocks on all of them
   * even though no test touches them. Waiting for DOMContentLoaded is
   * sufficient and strictly less flaky here -- the DOM is parsed and every
   * blocking head script (jQuery) and inline script has executed, which is
   * everything these pages need to be interactive. Anything arriving later is
   * covered by web-first assertions, which wait on their own.
   *
   * Honest limit: if the host stalls jQuery itself, DOMContentLoaded stalls too
   * and `navigationTimeout` is what catches it. This narrows the common
   * failure mode (slow decorative assets), it does not cure a dead dyno.
   */
  protected async navigate(path: string): Promise<void> {
    await this.page.goto(path, { waitUntil: 'domcontentloaded' });
  }
}
