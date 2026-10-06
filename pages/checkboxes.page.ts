import type { Locator, Page } from '@playwright/test';

import { BasePage } from './base.page';

/**
 * The /checkboxes form.
 *
 * The inputs have no `<label>`, `id`, `name` or accessible name -- the visible
 * "checkbox 1" / "checkbox 2" text are bare text nodes inside the form, not
 * label elements. There is genuinely no user-facing locator available, so a
 * scoped CSS selector plus positional access is the only correct option here.
 */
export class CheckboxesPage extends BasePage {
  static readonly path = '/checkboxes';

  /** All checkboxes, in document order. */
  readonly checkboxes: Locator;

  constructor(page: Page) {
    super(page);
    this.checkboxes = page.locator('#checkboxes input[type="checkbox"]');
  }

  async goto(): Promise<void> {
    await this.navigate(CheckboxesPage.path);
  }

  /**
   * A single checkbox, addressed by the number the app shows next to it.
   *
   * 1-based on purpose: specs read `checkbox(1)` / `checkbox(2)`, matching the
   * "checkbox 1" / "checkbox 2" labels a human sees on the page, so there is no
   * off-by-one translation between the test and the thing under test.
   */
  checkbox(position: number): Locator {
    return this.checkboxes.nth(position - 1);
  }

  async count(): Promise<number> {
    return this.checkboxes.count();
  }
}
