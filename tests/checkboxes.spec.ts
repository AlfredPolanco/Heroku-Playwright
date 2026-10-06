import { expect, test } from '../fixtures/pages.fixture';

test.describe('Checkboxes', () => {
  test.beforeEach(async ({ checkboxesPage }) => {
    await checkboxesPage.goto();
  });

  test('renders with the first checkbox unchecked and the second checked', async ({
    checkboxesPage,
  }) => {
    await expect(checkboxesPage.checkbox(1)).not.toBeChecked();
    await expect(checkboxesPage.checkbox(2)).toBeChecked();
  });

  test('checking the first checkbox and unchecking the second inverts both states', async ({
    checkboxesPage,
  }) => {
    await checkboxesPage.checkbox(1).check();
    await checkboxesPage.checkbox(2).uncheck();

    await expect(checkboxesPage.checkbox(1)).toBeChecked();
    await expect(checkboxesPage.checkbox(2)).not.toBeChecked();
  });

  test('each checkbox can be toggled to the opposite of its initial state', async ({
    checkboxesPage,
  }) => {
    const total = await checkboxesPage.count();
    expect(total).toBeGreaterThan(0);

    for (let position = 1; position <= total; position++) {
      const checkbox = checkboxesPage.checkbox(position);
      const wasChecked = await checkbox.isChecked();

      // setChecked drives the box to an absolute state rather than toggling,
      // so the assertion below cannot pass by accident if the click is lost.
      await checkbox.setChecked(!wasChecked);

      await expect(checkbox, `checkbox ${position} should have flipped`).toBeChecked({
        checked: !wasChecked,
      });
    }
  });
});
