/**
 * Browser-driven login flows shared by the native provider and the legacy API.
 *
 * Both flows return `{ token, webCookies }` so the caller can decide what to
 * persist. Nothing is written to disk here.
 */

const { launchBrowser, openLoginPage } = require('./puppeteer');
const { collectWebCookies } = require('./cookies');
const { waitForAuthCode } = require('./auth-code');
const { parseCallbackUrl } = require('../auth/oauth/pkce');
const { resolveProxy } = require('../auth/proxy/proxy');
const {
  LoginError,
  TwoFactorRequiredError,
  AuthError,
} = require('../errors');
const {
  findSecondFactorField,
  submitSecondFactor,
  resolveSecondFactorCode,
  SECOND_FACTOR_WATCH_MS,
} = require('./second-factor');

/** @param {number} ms */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run `fn` with a launched browser, always closing it afterwards.
 * @template T
 * @param {Object} options
 * @param {(browser: import('puppeteer').Browser) => Promise<T>} fn
 * @returns {Promise<T>}
 */
async function withBrowser(options, fn) {
  const proxy = resolveProxy(options.proxy);
  const browser = await launchBrowser({
    headless: options.headless === undefined ? false : options.headless,
    userDataDir: options.userDataDir,
    profile: options.profile,
    proxy,
  });

  try {
    if (typeof options.onBrowserOpen === 'function') options.onBrowserOpen(browser);
    return await fn(browser, proxy);
  } finally {
    try {
      await browser.close();
    } catch (error) {
      /* ignore cleanup errors */
    }
  }
}

/**
 * Turn a waitForAuthCode result into an authorization code, or throw.
 * @param {{ code: string|null, error: string|null, timedOut: boolean }} result
 * @param {string} hint
 * @returns {string}
 */
function requireCode(result, hint) {
  if (result.error) {
    throw new LoginError(`Pixiv returned an OAuth error ("${result.error}"). ${hint}`);
  }
  if (!result.code) {
    throw new LoginError(
      result.timedOut
        ? `Timed out waiting for the authorization code. ${hint}`
        : `No authorization code was returned. ${hint}`
    );
  }
  return result.code;
}

/**
 * Interactive login: the user completes login in a visible browser window.
 *
 * @param {Object} options
 * @param {string} options.loginUrl
 * @param {string} options.codeVerifier
 * @param {(code: string, verifier: string) => Promise<import('../auth/token/token-info').TokenInfo>} options.exchange
 * @returns {Promise<{ token: import('../auth/token/token-info').TokenInfo, webCookies: Record<string,string> }>}
 */
async function loginInteractive(options) {
  const timeout = options.timeout === undefined ? 300000 : options.timeout;

  return withBrowser({ ...options, headless: Boolean(options.headless) }, async (browser, proxy) => {
    const page = await openLoginPage(browser, options.loginUrl, { proxy, timeout: 60000 });
    if (typeof options.onPageReady === 'function') options.onPageReady(page, options.loginUrl);

    const result = await waitForAuthCode(page, timeout);
    const code = requireCode(
      result,
      'The login may have been cancelled. Please try again.'
    );

    const token = await options.exchange(code, options.codeVerifier);
    const webCookies = await collectWebCookies(browser);
    return { token, webCookies };
  });
}

/**
 * Find an element and type into it, trying several selectors.
 * @param {import('puppeteer').Page} page
 * @param {string[]} selectors
 * @param {string} text
 * @returns {Promise<import('puppeteer').ElementHandle|null>}
 */
async function typeIntoFirstMatch(page, selectors, text) {
  for (const selector of selectors) {
    try {
      const field = await page.$(selector);
      if (field) {
        await field.type(text, { delay: 100 });
        return field;
      }
    } catch (error) {
      /* try next selector */
    }
  }
  return null;
}

/**
 * Submit the credentials form.
 * @param {import('puppeteer').Page} page
 * @param {import('puppeteer').ElementHandle|null} passwordField
 */
async function submitCredentials(page, passwordField) {
  for (const selector of [
    'button[type="submit"]',
    'input[type="submit"]',
    '#LoginComponent button[type="submit"]',
  ]) {
    try {
      const button = await page.$(selector);
      if (button) {
        await button.click();
        return;
      }
    } catch (error) {
      /* try next selector */
    }
  }
  if (passwordField) await passwordField.press('Enter');
}

/**
 * After submitting credentials, either the redirect appears or Pixiv asks for
 * a second factor. Watch for a bounded period and handle 2FA if it shows up.
 *
 * @param {import('puppeteer').Page} page
 * @param {Object} options
 * @returns {Promise<{ code: string|null, error: string|null }|null>} terminal result if already done
 */
async function settleAfterSubmit(page, options) {
  const deadline = Date.now() + (options.secondFactorWatchMs || SECOND_FACTOR_WATCH_MS);

  while (Date.now() < deadline) {
    const terminal = parseCallbackUrl(page.url());
    if (terminal) return terminal;

    const field = await findSecondFactorField(page);
    if (field) {
      const code = await resolveSecondFactorCode(options);
      await submitSecondFactor(page, field, code);
      return null; // continue waiting for the redirect
    }
    await sleep(1000);
  }
  return null;
}

/**
 * Headless (automated) login with username/password.
 *
 * @param {Object} options
 * @param {string} options.username
 * @param {string} options.password
 * @param {string} options.loginUrl
 * @param {string} options.codeVerifier
 * @param {(code: string, verifier: string) => Promise<import('../auth/token/token-info').TokenInfo>} options.exchange
 * @returns {Promise<{ token: import('../auth/token/token-info').TokenInfo, webCookies: Record<string,string> }>}
 */
async function loginHeadless(options) {
  const { username, password } = options;
  const timeout = options.timeout === undefined ? 120000 : options.timeout;

  if (!username || String(username).trim() === '') {
    throw new LoginError('Username cannot be empty');
  }
  if (!password || String(password).trim() === '') {
    throw new LoginError('Password cannot be empty');
  }

  return withBrowser(
    { ...options, headless: options.headless === undefined ? true : Boolean(options.headless) },
    async (browser, proxy) => {
      const page = await openLoginPage(browser, options.loginUrl, { proxy, timeout: 60000 });
      if (typeof options.onPageReady === 'function') options.onPageReady(page, options.loginUrl);

      try {
        await page.waitForSelector('input[type="text"], input[autocomplete="username"]', {
          timeout: 30000,
        });
      } catch (error) {
        throw new LoginError('Could not load the Pixiv login form (selectors not found)', {
          cause: error,
        });
      }

      const usernameField = await typeIntoFirstMatch(
        page,
        [
          'input[autocomplete="username"]',
          'input[type="text"]',
          'input[name="pixiv_id"]',
          '#LoginComponent input[type="text"]',
        ],
        String(username).trim()
      );
      if (!usernameField) throw new LoginError('Could not find the username input field');

      const passwordField = await typeIntoFirstMatch(
        page,
        [
          'input[autocomplete="current-password"]',
          'input[type="password"]',
          'input[name="password"]',
          '#LoginComponent input[type="password"]',
        ],
        String(password)
      );
      if (!passwordField) throw new LoginError('Could not find the password input field');

      await submitCredentials(page, passwordField);

      let code = null;
      let error = null;

      const terminal = await settleAfterSubmit(page, options);
      if (terminal) {
        code = terminal.code;
        error = terminal.error;
      } else {
        const result = await waitForAuthCode(page, timeout);
        code = result.code;
        error = result.error;
      }

      if (error) {
        throw new LoginError(
          `Pixiv returned an OAuth error ("${error}"). Please check your credentials.`
        );
      }
      if (!code) {
        throw new LoginError(
          'Failed to get the authorization code. Please check your credentials' +
            (options.totpSecret || options.totpCode || options.totpPrompt
              ? '.'
              : ' or supply a TOTP code for two-factor accounts.')
        );
      }

      const token = await options.exchange(code, options.codeVerifier);
      const webCookies = await collectWebCookies(browser);
      return { token, webCookies };
    }
  );
}

// Keep the error classes reachable for consumers of the legacy shim.
const exportedErrors = { AuthError, LoginError, TwoFactorRequiredError };

module.exports = {
  withBrowser,
  requireCode,
  loginInteractive,
  loginHeadless,
  sleep,
  exportedErrors,
};
