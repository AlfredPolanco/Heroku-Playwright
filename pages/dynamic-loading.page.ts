import type { Locator, Page } from '@playwright/test';

import { BasePage } from './base.page';

/**
 * The two /dynamic_loading examples:
 *  1. `#finish` is already in the DOM but `display:none`.
 *  2. `#finish` is injected into the DOM only after the delay.
 *
 * Both share one page object because the markup, the Start control and the
 * loading indicator are identical -- only how `#finish` arrives differs, and a
 * visibility assertion is correct for both.
 */
export type DynamicLoadingExample = 1 | 2;

/**
 * Both examples hard-code `setTimeout(..., 5000)` before revealing `#finish`.
 *
 * Playwright's default `expect` timeout is also 5000 ms, so a default-timeout
 * assertion races the app's own delay and resolves to a coin flip the moment
 * any latency is added -- and this is a shared, free-tier Heroku app that can
 * stall for seconds. That is the single biggest flake risk in this suite.
 *
 * 15 s = the app's 5 s delay + 10 s of headroom for a slow dial or a cold dyno.
 * It is applied to this one assertion only; inflating the global `expect`
 * timeout would hide genuinely broken locators everywhere else behind a long
 * wait, which is the opposite of what a timeout is for.
 */
export const FINISH_TIMEOUT_MS = 15_000;

export class DynamicLoadingPage extends BasePage {
  readonly startButton: Locator;

  /**
   * Injected on click, then hidden (not removed) once loading completes --
   * so `toBeHidden()` is the correct end-state assertion, not `toHaveCount(0)`.
   * The app gives this element no role or accessible name, only an id.
   */
  readonly loadingIndicator: Locator;

  /**
   * Exists-but-hidden in example 1 and absent until the delay elapses in
   * example 2. A presence check would therefore pass instantly in example 1
   * while the text is still invisible, which is why specs assert visibility.
   */
  readonly finishText: Locator;

  constructor(page: Page) {
    super(page);
    this.startButton = page.getByRole('button', { name: 'Start' });
    this.loadingIndicator = page.locator('#loading');
    this.finishText = page.locator('#finish');
  }

  async goto(example: DynamicLoadingExample): Promise<void> {
    await this.navigate(`/dynamic_loading/${example}`);
  }

  async start(): Promise<void> {
    await this.startButton.click();
  }
}
