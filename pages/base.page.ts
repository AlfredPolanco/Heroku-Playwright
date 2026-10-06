import { errors, type Locator, type Page } from '@playwright/test';

/** Attempts per navigation: the initial one plus two retries. */
const NAVIGATION_ATTEMPTS = 3;

/** Linear backoff between navigation attempts, giving a busy dyno a moment. */
const NAVIGATION_RETRY_BACKOFF_MS = 1_000;

/**
 * Transient = the host failed to deliver the document at all (timeout or a
 * transport-level error, across all three engines' error dialects). A 404 or a
 * genuinely wrong URL does not raise these, so a real mistake still fails fast
 * instead of being retried into a slow, confusing failure.
 */
const isTransientNavigationError = (error: unknown): boolean => {
  if (error instanceof errors.TimeoutError) return true;
  if (!(error instanceof Error)) return false;

  return /net::|NS_ERROR_|ERR_|Could not connect|socket hang up|connection (was )?(reset|closed)/i.test(
    error.message,
  );
};

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

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
   * Two reliability decisions, both aimed at the target being a free shared
   * Heroku dyno that intermittently stops serving:
   *
   * 1. `domcontentloaded` rather than Playwright's default `load`. The DOM is
   *    parsed and every blocking head script (jQuery) and inline script has
   *    run, which is everything these pages need to be interactive; `load`
   *    would additionally block on assets no test touches. Anything arriving
   *    later is covered by web-first assertions, which wait on their own.
   *
   * 2. A bounded retry of the navigation itself. This retries *reaching the
   *    page* -- an idempotent GET of a static document, before a single
   *    assertion runs -- and never retries application behaviour, which stays
   *    single-shot and web-first. It is deliberately not a hard wait: nothing
   *    here sleeps on app state, and the backoff only spaces out attempts
   *    against a host that returns nothing at all. Measured against live, the
   *    sole remaining failure mode was exactly this: `page.goto` timing out on
   *    a random test per run while every assertion passed.
   *
   * Cheaper and more precise than leaning on test-level `retries`, which
   * re-executes a whole passing test to recover from one failed GET.
   */
  protected async navigate(path: string): Promise<void> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= NAVIGATION_ATTEMPTS; attempt++) {
      try {
        await this.page.goto(path, { waitUntil: 'domcontentloaded' });
        return;
      } catch (error) {
        if (!isTransientNavigationError(error)) throw error;

        lastError = error;
        if (attempt < NAVIGATION_ATTEMPTS) await delay(attempt * NAVIGATION_RETRY_BACKOFF_MS);
      }
    }

    throw lastError;
  }
}
