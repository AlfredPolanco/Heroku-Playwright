import { expect, test } from '../fixtures/pages.fixture';
import { FINISH_TIMEOUT_MS } from '../pages/dynamic-loading.page';

const FINISH_TEXT = 'Hello World!';

test.describe('Dynamic loading', () => {
  test('example 1: reveals the hidden finish text after loading completes', async ({
    dynamicLoadingPage,
  }) => {
    await dynamicLoadingPage.goto(1);

    // On this page #finish is already in the DOM with `display:none`, so a
    // presence check would pass immediately and prove nothing. Visibility is
    // the only assertion that reflects what a user can actually see.
    await expect(dynamicLoadingPage.finishText).toBeHidden();

    await dynamicLoadingPage.start();

    await expect(dynamicLoadingPage.loadingIndicator).toBeVisible();

    // The app waits a hard-coded 5s before revealing #finish -- exactly
    // Playwright's default expect timeout -- so this one assertion gets an
    // explicit 15s budget. See FINISH_TIMEOUT_MS for the full reasoning.
    // The global expect timeout stays at its default so that a genuinely
    // broken locator anywhere else still fails fast.
    await expect(dynamicLoadingPage.finishText).toBeVisible({ timeout: FINISH_TIMEOUT_MS });
    await expect(dynamicLoadingPage.finishText).toHaveText(FINISH_TEXT);

    // Hidden rather than detached: the app calls .hide() on the indicator and
    // leaves it in the DOM.
    await expect(dynamicLoadingPage.loadingIndicator).toBeHidden();
  });

  test('example 2: renders the finish text that does not exist until loading completes', async ({
    dynamicLoadingPage,
  }) => {
    await dynamicLoadingPage.goto(2);

    // Here #finish is genuinely absent until the delay elapses.
    await expect(dynamicLoadingPage.finishText).toHaveCount(0);

    await dynamicLoadingPage.start();

    await expect(dynamicLoadingPage.loadingIndicator).toBeVisible();

    await expect(dynamicLoadingPage.finishText).toBeVisible({ timeout: FINISH_TIMEOUT_MS });
    await expect(dynamicLoadingPage.finishText).toHaveText(FINISH_TEXT);
    await expect(dynamicLoadingPage.loadingIndicator).toBeHidden();
  });
});
