import { defineConfig, devices } from '@playwright/test';

const isCI = Boolean(process.env.CI);

/**
 * Reporters differ by environment on purpose:
 *  - local: `list` for live feedback, `html` for post-hoc debugging.
 *  - CI:    `github` for inline PR annotations, `junit` for the test summary
 *           UI, `html` with `open: 'never'` so the run never blocks on a
 *           browser, plus `list` so the raw log stays readable.
 *
 * The JUnit path is suffixed per browser project when PW_PROJECT is set, so a
 * CI matrix uploading one artifact per browser cannot overwrite a sibling's
 * results file.
 */
const junitOutputFile = process.env.PW_PROJECT
  ? `test-results/junit-${process.env.PW_PROJECT}.xml`
  : 'test-results/junit.xml';

export default defineConfig({
  testDir: './tests',

  /* Run files in parallel, and tests within a file in parallel too. Every test
     here is independent: no shared login state, no ordering, no fixtures with
     cross-test side effects, so this is safe rather than optimistic. */
  fullyParallel: true,

  /* Fail the CI build if a `test.only` is committed by accident. */
  forbidOnly: isCI,

  /* Retries exist for the shared demo app's own unreliability (cold dynos,
     transient 5xx), not to paper over race conditions in the suite -- hence
     `test:stability`, which proves the dynamic-loading spec passes 20x with
     zero retries. Locally retries stay at 0 so flakiness is never hidden
     during development. */
  retries: isCI ? 2 : 0,

  /* the-internet.herokuapp.com is a free, shared, third-party app. Unlimited
     workers would both hammer someone else's host and manufacture flakiness
     via self-inflicted latency, so CI is capped at 4 -- enough to keep the run
     fast, polite enough not to be the cause of its own failures. Locally,
     Playwright's default (half the cores) is fine. */
  workers: isCI ? 4 : undefined,

  /* Per-test budget. Must exceed the worst-case navigation spend -- three
     attempts at `navigationTimeout` plus backoff (~48s, see BasePage.navigate)
     -- plus the dynamic-loading page's own 5s delay. Sized so that an
     unreachable host reports the actual navigation error rather than a vague
     test timeout. A ceiling, not a wait: web-first assertions still resolve as
     soon as they can. */
  timeout: 90_000,

  expect: {
    /* Left at Playwright's 5s default on purpose. The long wait this suite
       genuinely needs is scoped to the one assertion that needs it (see
       FINISH_TIMEOUT_MS in pages/dynamic-loading.page.ts). Raising it globally
       would turn every real locator bug into a slow failure. */
    timeout: 5_000,
  },

  use: {
    baseURL: process.env.BASE_URL ?? 'https://the-internet.herokuapp.com',

    /* Sized for a slow shared host. These cover network/navigation latency,
       which is infrastructure, not application behaviour -- unlike the
       assertion timeout above.

       navigationTimeout is 15s rather than 30s because navigation is retried
       (BasePage.navigate): when the dyno is healthy it answers in well under a
       second, so a stalled attempt is better cut short and retried than left
       hanging for 30s. Three 15s attempts also fit inside the test budget. */
    actionTimeout: 15_000,
    navigationTimeout: 15_000,

    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  reporter: isCI
    ? [
        ['github'],
        ['junit', { outputFile: junitOutputFile }],
        ['html', { open: 'never' }],
        ['list'],
      ]
    : [['list'], ['html']],

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
