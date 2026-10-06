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

### Navigation waits on `domcontentloaded`

`page.goto` defaults to `waitUntil: 'load'`, which blocks on every decorative asset — the fork-me PNG, font-awesome, jQuery UI — that no test touches. `domcontentloaded` is sufficient (the DOM is parsed and all blocking head scripts and inline scripts have run, which is everything these pages need to be interactive) and strictly less flaky against a host that dribbles out assets. Anything arriving later is covered by web-first assertions.

Honest limit: if the host stalls jQuery itself, `DOMContentLoaded` stalls too and `navigationTimeout` is what catches it. This narrows the common failure mode; it does not cure a dead dyno.

## Stability results

`test:stability` runs the dynamic loading spec 20× to prove the timeout reasoning holds rather than asserting it. Run with `--retries=0` so nothing is masked:

```
120/120 passed (2.8m)   # 2 tests × 20 repeats × 3 browsers, zero retries, zero flakes
```

Full suite: **30/30 passed** across Chromium, Firefox and WebKit.

These numbers were produced against the local replica, because the live app was unable to serve browser traffic throughout development — see below. The suite is unmodified between targets; only `BASE_URL` differs.

## Live app availability — a caveat worth reading

The live app was **persistently unable to complete a browser page load** from this machine during development. Diagnosis, since the symptom looks like a test bug and is not:

- Individual requests over `curl` succeeded consistently (HTTP 200, <1 s).
- Six _concurrent_ requests to the Heroku app timed out; the same six against `example.com` all returned 200. So the local network and HTTP/2 stack were fine — the dyno was not.
- A browser page load needs ~7 concurrent subresources. All of them, including the blocking `jquery-1.11.3.min.js`, stalled indefinitely, so neither `load` nor `domcontentloaded` could ever fire.
- Reducing to `--workers=1` and a single test did not help, confirming the suite was not the source of the load.

This is the app being "slow or occasionally unresponsive" at the extreme end. It is an upstream outage, not a defect in the suite, and nothing in test code can fix an upstream that will not serve bytes. **The suite should be re-run against the live app once it recovers**; the configuration already targets it by default.

This is also why `workers` is capped in CI and why the local replica exists.

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

**Workers are capped at 4 in CI.** Not a performance tweak — the target is a free, shared, third-party app. Unlimited workers would both hammer someone else's host and manufacture flakiness through self-inflicted latency, making the suite the cause of its own failures. Locally, Playwright's default (half the cores) applies.

**Retries: 2 in CI, 0 locally.** CI retries absorb genuine upstream unreliability — cold dynos, transient 5xx. Locally they stay at 0 so flakiness is never hidden during development, and `test:stability` runs with retries off so it cannot be flattered by them.

**Reporters.** Local: `list` + `html`. CI: `github` (inline PR annotations), `junit`, `html` with `open: 'never'` (so the run never blocks on a browser), plus `list` for a readable log. The JUnit path is suffixed per browser via `PW_PROJECT`, so the three matrix legs cannot overwrite each other's results file.

**Artifacts** (HTML report, traces, screenshots, videos, JUnit XML) upload with `if: ${{ !cancelled() }}` — they are most valuable precisely when the run failed. `trace: 'on-first-retry'` keeps traces cheap while still capturing anything that needed a retry.

Because CI depends on a third-party app, a red nightly run may reflect upstream availability rather than a regression — check the trace before assuming a code defect.

## Quality gates

Flat-config ESLint with `typescript-eslint` **type-checked** rules (these catch a forgotten `await` on an assertion, which silently turns a test into a no-op — the highest-value lint rule in any Playwright suite) plus `eslint-plugin-playwright`. The anti-flake rules the project commits to are promoted from warnings to **errors**: `no-wait-for-timeout`, `no-element-handle`, `no-force-option`, `no-page-pause`, `no-skipped-test`, `expect-expect`, `prefer-web-first-assertions`, `require-top-level-describe`.

TypeScript runs `strict` plus `noUncheckedIndexedAccess`, `noImplicitOverride`, `noUnusedLocals` and friends — the suite is the product, so it is held to app-code standards.

## Scope notes

Kept out on purpose: no custom assertion wrappers around `expect`, no BDD layer, no config abstraction over `defineConfig`, no `data-testid` hunting on an app I don't control. Each would add indirection without removing duplication at this size.

Edge cases were added where they test distinct behaviour — empty credentials (a different validation path), logout (a state transition back to `/login`), toggling every checkbox via `setChecked` (absolute state, so a lost click cannot pass by accident), and `/dynamic_loading/2` (element injected rather than revealed, exercising the `toHaveCount(0)` → `toBeVisible` path the first example cannot). The suite was not padded beyond that.

## AI usage

Claude (Opus 5) in Claude Code wrote the implementation under my direction and architectural constraints, with the workflow deliberately structured so the model's output was checked against reality rather than trusted:

- **Verification before implementation.** Every flash message, DOM structure and element role was probed on the live app with `curl` _before_ any assertion was written — the brief's "verify before hardcoding" instruction, applied as the first step rather than a review afterthought. This is what surfaced the `×` dismiss link that breaks exact `toHaveText`, the Logout link-vs-button role, and the username-first validation order.
- **Running the tests was treated as part of writing them.** The duplicate "Secure Area" heading was found by executing the suite, not by reading markup — and it would have been a real failure against the live app too.
- **Lint findings were fixed by restructuring, not suppressing.** `playwright/no-conditional-in-test` flagged the `if (outcome === 'success')` branch in the first draft of the login loop. Rather than add a disable comment, the data model was split into two arrays, which removed the conditional and simplified the types. The rule was right.
- **The upstream outage was diagnosed rather than worked around.** Differential testing (`curl` vs browser, sequential vs concurrent, Heroku vs `example.com`) established the failure was upstream before any code changed — which prevented "fixing" a non-existent test bug by inflating timeouts, the tempting wrong move.

Judgement I kept: abstraction boundaries, the decision not to inflate the global timeout, scoping `BasePage` to actual reuse, capping CI workers out of courtesy to a shared host, and treating the local replica as a verification aid rather than letting it quietly become the real target.
