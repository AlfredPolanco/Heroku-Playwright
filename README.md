# Playwright UI Automation — the-internet.herokuapp.com

A TypeScript Playwright suite covering login (data-driven), dynamic content loading, and form inputs on [the-internet.herokuapp.com](https://the-internet.herokuapp.com), with CI across Chromium, Firefox and WebKit.

## Quick start

```bash
npm ci
npx playwright install --with-deps
npm test
```

| Script                   | Purpose                                                         |
| ------------------------ | --------------------------------------------------------------- |
| `npm test`               | Full suite, all three browsers                                  |
| `npm run test:chromium`  | Chromium only (fastest feedback loop)                           |
| `npm run test:headed`    | Watch it run in a real browser                                  |
| `npm run test:ui`        | Playwright UI mode (time-travel debugging)                      |
| `npm run test:stability` | Dynamic loading spec ×20 — the anti-flake proof                 |
| `npm run report`         | Open the last HTML report                                       |
| `npm run verify`         | `typecheck` + `lint` + `format:check` (what CI gates on)        |
| `npm run local-app`      | Start the offline replica (see [Local replica](#local-replica)) |

`BASE_URL` overrides the target (defaults to the live app).

## Layout

```
pages/            Page objects — locators + intent-revealing actions, no assertions
  base.page.ts        shared navigation + the app-wide #flash banner
  login.page.ts       /login
  secure-area.page.ts /secure
  dynamic-loading.page.ts  /dynamic_loading/1 and /2
  checkboxes.page.ts  /checkboxes
fixtures/
  pages.fixture.ts  test.extend — page objects injected, so specs never call `new`
test-data/
  credentials.ts    typed login cases + verified flash-message strings
tests/              specs; all assertions live here
tools/local-app/    optional offline replica of the pages under test
.github/workflows/  CI
```

### Design decisions

**Page objects hold locators and intent, specs hold assertions.** A page object that asserts hides _what_ a test verifies behind a method name. The one exception would be a genuinely reusable multi-step assertion; nothing here met that bar.

**Fixtures over manual instantiation.** `test.extend` makes page objects lazy (a spec only pays for what it destructures) and guarantees each test gets a fresh instance bound to its own `page`. Specs import `test`/`expect` from one module.

**`BasePage` is deliberately thin.** It earns its place on two pieces of real reuse — `navigate()` and the `#flash` banner shared by `/login` and `/secure` — and nothing more. It is not a wrapper around Playwright's `Locator` API, which is already the right abstraction.

**Success and failure login cases are separate arrays, not one array with an `outcome` discriminant.** The two outcomes assert different things. Merging them forces a runtime `if` inside the test body, which obscures which assertions actually ran (and `eslint-plugin-playwright` flags it, correctly). Two homogeneous loops keep every test branch-free and let the types guarantee a failure case always carries its expected error.

**Locator priority.** `getByLabel` for the login inputs (they have real `<label for>`), `getByRole` for the Login button and Secure Area heading. Scoped CSS ids only where the app offers no accessible alternative: `#flash`, `#loading`, `#finish`, and the checkboxes — whose inputs have no label, id, name or accessible name, with "checkbox 1"/"checkbox 2" being bare text nodes rather than label elements. No XPath anywhere.

`CheckboxesPage.checkbox()` is **1-based** so specs read `checkbox(1)`/`checkbox(2)`, matching the numbering a human sees on the page.

## Verified against the live app, not assumed

Every string and structural assumption was confirmed against the running app before being hardcoded. Three findings changed the implementation:

1. **The flash element contains a dismiss link.** Its text is `"Your username is invalid!\n×"`, so an exact `toHaveText` would fail. Specs use `toContainText`.
2. **Logout is `<a href="/logout">`, not a button.** Its accessible role is `link`. `getByRole('button', { name: 'Logout' })` would simply never match, so the page object asserts the real role.
3. **The Secure Area heading needs `exact: true`.** The subheader reads "Welcome to the Secure Area…", so a substring match resolves to two headings and trips strict mode. This was caught by an actual test run, not by reading the markup.

Confirmed flash texts:

| Scenario          | Message                              |
| ----------------- | ------------------------------------ |
| Valid login       | `You logged into a secure area!`     |
| Logout            | `You logged out of the secure area!` |
| Invalid username  | `Your username is invalid!`          |
| Invalid password  | `Your password is invalid!`          |
| Empty credentials | `Your username is invalid!`          |

Empty credentials surface the _username_ error because the app validates username first — verified, not inferred.

### Credentials in version control

`tomsmith` / `SuperSecretPassword!` are committed deliberately: the app prints them on the `/login` page itself, so they are public demo credentials with no security value. Real credentials would come from the environment (`process.env`) and a secret store, never from `test-data/`.

## The dynamic loading timeout — the important bit

Both `/dynamic_loading` pages run this on click:

```js
setTimeout(function () {
  $('#loading').hide();
  $('#finish').show();
}, 5000);
```

**5000 ms is exactly Playwright's default `expect` timeout.** A default-timeout assertion therefore races the app's own delay and is a coin flip the instant any latency is added — and this is a shared free-tier Heroku app. This is the single biggest flake risk in the suite.

The fix is a **scoped** timeout on the one assertion that needs it:

```ts
await expect(dynamicLoadingPage.finishText).toBeVisible({ timeout: FINISH_TIMEOUT_MS }); // 15s
```

15 s = the app's 5 s delay + 10 s headroom for a slow connection or cold dyno. The **global `expect` timeout stays at its 5 s default** on purpose: inflating it would hide every genuinely broken locator in the suite behind a long wait, which is the opposite of what a timeout is for.

Two further details that a naive test gets wrong:

- **`#finish` exists in the DOM but is `display:none` on example 1.** A presence check (`toHaveCount(1)`, `waitForSelector` with default state) passes _immediately_ and proves nothing. Only visibility reflects what a user sees. Example 2 injects `#finish` after the delay, so the spec asserts `toHaveCount(0)` up front there and `toBeVisible` after — the same page object serves both.
- **The loading indicator is hidden, not removed.** The app calls `.hide()` and leaves the node in the DOM, so the end-state assertion is `toBeHidden()`, not `toHaveCount(0)`.

No `waitForTimeout`, no `page.waitForSelector`, no sleeps anywhere — `playwright/no-wait-for-timeout` is an ESLint **error**, so a regression breaks the build rather than slipping through review.

## Surviving an unreliable target

The target is a free shared Heroku dyno that intermittently stops serving. Initially the suite could not complete a **single** page load against it; it now runs green. Three changes got it there, each adopted only after measurement — and two plausible-sounding fixes were tested and **rejected**.

### 1. Don't fetch assets no assertion needs (the big one)

Every test gets a fresh browser context, so every page load refetches the whole asset set cold — about **380 KB of it stylesheets** (`app.css` alone is 353 KB). That payload is what the dyno cannot deliver. Measured over 8 cold-cache navigations while the app was degraded:

| Subresources dropped          | Navigations OK | Avg    |
| ----------------------------- | -------------- | ------ |
| none                          | **1/8**        | 2367ms |
| images, fonts, unused scripts | 3/8            | 1481ms |
| + stylesheets                 | **8/8**        | 708ms  |

So [`fixtures/pages.fixture.ts`](fixtures/pages.fixture.ts) aborts images, fonts, media, stylesheets, and three scripts the pages under test provably don't use (a 132 KB analytics bundle, jQuery UI, and Foundation — which only powers the flash dismiss "×" that no test clicks). jQuery is kept; the dynamic-loading pages depend on it. This also cut the full-suite runtime from ~3.4 min to ~20 s.

**The trade-off, stated plainly:** with CSS dropped, `toBeVisible()` no longer reflects stylesheet-driven visibility. That is sound _for these pages_ — every show/hide under test is driven by inline styles jQuery sets (`#finish` ships with `style='display:none'`; `#loading` is hidden via `.hide()`), which the suite still verifies exactly. It would **not** be sound on a page that hides things with a CSS class, and the fixture should be revisited before covering one. `LOAD_ALL_ASSETS=1 npm test` opts out.

### 2. Navigation waits on `domcontentloaded`, and is retried

`page.goto` defaults to `waitUntil: 'load'`. `domcontentloaded` is sufficient — the DOM is parsed and every blocking head script (jQuery) and inline script has run, which is all these pages need to be interactive. Anything later is covered by web-first assertions.

[`BasePage.navigate()`](pages/base.page.ts) also retries navigation up to 3 times with linear backoff, because after the asset fix the _only_ remaining failure mode was `page.goto` timing out on a random test per run while every assertion passed. This retries **reaching the page** — an idempotent GET of a static document, before any assertion runs — and never retries application behaviour, which stays single-shot and web-first. It is not a hard wait: nothing sleeps on app state. Non-transient errors (a 404, a bad URL) are re-thrown immediately, so a real mistake still fails fast.

`navigationTimeout` is 15 s rather than 30 s precisely _because_ navigation is retried: a healthy dyno answers in well under a second, so a stalled attempt is better cut short and retried. Per-test `timeout` is 90 s so the worst case (three attempts + backoff + the 5 s app delay) reports the real navigation error instead of a vague test timeout.

### Rejected after testing

- **Disabling HTTP/2.** Single `curl` requests succeeded while concurrent multiplexed ones timed out, which looked like a broken HTTP/2 path. Comparing Chromium with and without `--disable-http2` showed both loading fine — the app had simply recovered between probes. No evidence, so no workaround.
- **Capping workers.** `--workers=1` did not help during a bad phase, confirming the suite was not the source of the load.

`workers` is still capped at 4 in CI, but for courtesy to a shared host rather than as a flakiness fix.

## Results

All runs with `--retries=0`, so nothing is masked by retries.

**Against the live app:**

```
npm run test:stability   ->  120/120 passed (3.0m)   # 2 tests x 20 repeats x 3 browsers
npm test                 ->   30/30  passed (20.7s)  # 4 of 5 consecutive runs fully green;
                                                     # 1 run had a single page.goto timeout
```

**Against the local replica** (deterministic, no third party): 30/30 and 120/120.

The residual ~1-in-5 chance of one transient navigation failure is upstream availability, not suite logic: the failures are always `page.goto` timeouts on a _different_ random test each time, never assertion failures, and CI's `retries: 2` absorbs them. If the dyno enters a prolonged bad phase, runs will fail regardless of client-side technique — nothing in test code can fix a host that will not serve bytes.

## Local replica

`tools/local-app/server.js` is a dependency-free Node server reproducing the pages under test, for deterministic stability runs and for working while the upstream is unavailable:

```bash
npm run local-app                 # terminal 1
npm run test:local                # terminal 2
npm run test:stability:local
```

Fidelity: element ids, label/input wiring, accessible names, the inline `display:none` on `#finish`, the 5000 ms delay and the `/authenticate` flash-and-redirect behaviour are copied verbatim from the live app, so the same locators and the same timeout reasoning apply. It even reproduces the duplicate-heading strict-mode trap. Two deliberate differences: page scripts are rewritten in vanilla JS (identical DOM mutations and timing, without vendoring ~96 KB of jQuery), and decorative assets are omitted since no assertion depends on them.

It is a harness for the pages under test, **not** a general stand-in for the app. The suite targets live by default and passing against the replica is not a substitute for passing against live.

## Local replica

`tools/local-app/server.js` is a dependency-free Node server reproducing the pages under test, for when the upstream is unavailable and for deterministic stability runs:

```bash
npm run local-app                 # terminal 1
npm run test:local                # terminal 2
npm run test:stability:local      # the 120-run proof above
```

Fidelity: element ids, label/input wiring, accessible names, the inline `display:none` on `#finish`, the 5000 ms delay and the `/authenticate` flash-and-redirect behaviour are copied verbatim from the live app, so the same locators and the same timeout reasoning apply. It even reproduces the duplicate-heading strict-mode trap. Two deliberate differences: page scripts are rewritten in vanilla JS (identical DOM mutations and timing, without vendoring ~96 KB of jQuery), and decorative assets are omitted since no assertion depends on them.

It is a harness for the pages under test, **not** a general stand-in for the app, and passing against it is not a substitute for passing against live.

## CI

[`.github/workflows/playwright.yml`](.github/workflows/playwright.yml) — on push/PR to `main`, nightly, and manual dispatch.

**Two jobs.** `static-checks` (typecheck, lint, format) runs separately from tests: it needs no browsers, so it gives fast feedback instead of sitting behind a browser install.

**Parallelism, at two levels:**

- _Across runners_ — a `matrix` over `[chromium, firefox, webkit]` puts each browser on its own runner, concurrently. `fail-fast: false`, so a WebKit-only break still reports Chromium and Firefox. Each job installs only the browser it needs.
- _Within a runner_ — `fullyParallel: true` runs files **and** tests within a file in parallel. That is safe rather than optimistic here: every test navigates itself, shares no login state, and depends on no ordering.

**Workers are capped at 4 in CI** out of courtesy to a shared third-party host, not as a flakiness fix — `--workers=1` was tested during a bad phase and did not help. Locally, Playwright's default (half the cores) applies.

**Retries: 2 in CI, 0 locally.** CI retries absorb genuine upstream unreliability — cold dynos, transient 5xx. Locally they stay at 0 so flakiness is never hidden during development, and `test:stability` runs with retries off so it cannot be flattered by them.

**Reporters.** Local: `list` + `html`. CI: `github` (inline PR annotations), `junit`, `html` with `open: 'never'` (so the run never blocks on a browser), plus `list` for a readable log. The JUnit path is suffixed per browser via `PW_PROJECT`, so the three matrix legs cannot overwrite each other's results file.

**Artifacts** (HTML report, traces, screenshots, videos, JUnit XML) upload with `if: ${{ !cancelled() }}` — they are most valuable precisely when the run failed. `trace: 'on-first-retry'` keeps traces cheap while still capturing anything that needed a retry.

Because CI depends on a third-party app, a red nightly run may reflect upstream availability rather than a regression — check the trace before assuming a code defect.

## Quality gates

Flat-config ESLint with `typescript-eslint` **type-checked** rules (these catch a forgotten `await` on an assertion, which silently turns a test into a no-op — the highest-value lint rule in any Playwright suite) plus `eslint-plugin-playwright`. The anti-flake rules the project commits to are promoted from warnings to **errors**: `no-wait-for-timeout`, `no-element-handle`, `no-force-option`, `no-page-pause`, `no-skipped-test`, `expect-expect`, `prefer-web-first-assertions`, `require-top-level-describe`.

TypeScript runs `strict` plus `noUncheckedIndexedAccess`, `noImplicitOverride`, `noUnusedLocals` and friends — the suite is the product, so it is held to app-code standards.

## Scope notes

Kept out on purpose: no custom assertion wrappers around `expect`, no BDD layer, no config abstraction over `defineConfig`, no `data-testid` hunting on an app I don't control. Each would add indirection without removing duplication at this size.

`ai-sessions/` is Prettier-ignored: those files are verbatim session transcripts, and reformatting them (collapsing whitespace, re-indenting quoted blocks) would stop them being faithful records.

Edge cases were added where they test distinct behaviour — empty credentials (a different validation path), logout (a state transition back to `/login`), toggling every checkbox via `setChecked` (absolute state, so a lost click cannot pass by accident), and `/dynamic_loading/2` (element injected rather than revealed, exercising the `toHaveCount(0)` → `toBeVisible` path the first example cannot). The suite was not padded beyond that.

## AI usage

Claude (Opus 5) in Claude Code wrote the implementation under my direction and architectural constraints, with the workflow deliberately structured so the model's output was checked against reality rather than trusted:

- **Verification before implementation.** Every flash message, DOM structure and element role was probed on the live app with `curl` _before_ any assertion was written — the brief's "verify before hardcoding" instruction, applied as the first step rather than a review afterthought. This is what surfaced the `×` dismiss link that breaks exact `toHaveText`, the Logout link-vs-button role, and the username-first validation order.
- **Running the tests was treated as part of writing them.** The duplicate "Secure Area" heading was found by executing the suite, not by reading markup — and it would have been a real failure against the live app too.
- **Lint findings were fixed by restructuring, not suppressing.** `playwright/no-conditional-in-test` flagged the `if (outcome === 'success')` branch in the first draft of the login loop. Rather than add a disable comment, the data model was split into two arrays, which removed the conditional and simplified the types. The rule was right.
- **The upstream problem was measured, not guessed at.** Differential testing (`curl` vs browser, sequential vs concurrent, HTTP/1.1 vs HTTP/2, Heroku vs `example.com`) established the failure was upstream before any code changed — which prevented "fixing" a non-existent test bug by inflating timeouts, the tempting wrong move. Two candidate fixes were then **rejected on evidence**: disabling HTTP/2 (the app had merely recovered between probes) and capping workers (no effect during a bad phase).
- **A confounded experiment was caught and redone.** The first asset-blocking measurement reused one browser context, so navigations 2–N were served from the browser's HTTP cache and the comparison showed blocking as _harmful_ (8/10 vs 10/10). Re-running with a fresh context per navigation — matching what Playwright actually does per test — reversed the result decisively (8/8 vs 1/8) and identified stylesheets as the real culprit. The first number was measured, plausible, and wrong; it would have led to shipping nothing and declaring the app simply broken.
- **Claims in this README were checked against reruns.** An earlier draft asserted the live app "cannot serve browser traffic" and that no client-side change could help. Both turned out to be overstated once the asset fix landed, and the section was rewritten rather than left to read well.

Judgement I kept: abstraction boundaries, the decision not to inflate the global timeout, scoping `BasePage` to actual reuse, retrying navigation but never assertions, accepting the CSS-fidelity trade-off consciously and documenting it rather than burying it, and treating the local replica as a verification aid rather than letting it quietly become the real target.
