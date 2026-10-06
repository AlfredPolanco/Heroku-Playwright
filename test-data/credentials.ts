/**
 * Login test data.
 *
 * These credentials are the public, documented demo credentials for
 * the-internet.herokuapp.com (the app prints them on the /login page itself),
 * so committing them is safe. Real secrets would come from the environment.
 */

export interface Credentials {
  readonly username: string;
  readonly password: string;
}

export const VALID_CREDENTIALS: Credentials = {
  username: 'tomsmith',
  password: 'SuperSecretPassword!',
} as const;

/**
 * Flash-message texts, verified against the live app rather than assumed.
 *
 * The flash container also holds a "×" dismiss link, so its full text node is
 * e.g. "Your username is invalid!\n×". Specs therefore assert with
 * `toContainText`, never an exact `toHaveText`.
 */
export const FLASH_MESSAGES = {
  loginSucceeded: 'You logged into a secure area!',
  logoutSucceeded: 'You logged out of the secure area!',
  invalidUsername: 'Your username is invalid!',
  invalidPassword: 'Your password is invalid!',
} as const;

interface LoginCase {
  /** Completes the test title, which must be unique per case. */
  readonly title: string;
  readonly credentials: Credentials;
}

export interface SuccessfulLoginCase extends LoginCase {
  readonly expectedPath: string;
}

export interface FailedLoginCase extends LoginCase {
  /** Substring the error flash must contain. */
  readonly expectedError: string;
}

/**
 * Success and failure cases are separate arrays rather than one array with an
 * `outcome` discriminant. The two outcomes assert different things, so keeping
 * them apart lets each spec loop stay branch-free -- a conditional inside a
 * test obscures which assertions actually ran, and the type system then can't
 * tell you a case is missing its expected error.
 */
export const SUCCESSFUL_LOGIN_CASES: readonly SuccessfulLoginCase[] = [
  {
    title: 'valid credentials',
    credentials: VALID_CREDENTIALS,
    expectedPath: '/secure',
  },
] as const;

export const FAILED_LOGIN_CASES: readonly FailedLoginCase[] = [
  {
    title: 'an invalid username',
    credentials: { username: 'not-tomsmith', password: VALID_CREDENTIALS.password },
    expectedError: FLASH_MESSAGES.invalidUsername,
  },
  {
    title: 'an invalid password',
    credentials: { username: VALID_CREDENTIALS.username, password: 'not-the-password' },
    expectedError: FLASH_MESSAGES.invalidPassword,
  },
  {
    // The app validates the username first, so empty credentials surface the
    // username error -- confirmed against the live app, not inferred.
    title: 'empty credentials',
    credentials: { username: '', password: '' },
    expectedError: FLASH_MESSAGES.invalidUsername,
  },
] as const;
