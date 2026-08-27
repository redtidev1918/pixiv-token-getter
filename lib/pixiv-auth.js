/**
 * Pixiv Authentication API
 * Core API for getting Pixiv tokens
 */

const crypto = require('crypto');

// Pixiv OAuth constants
const USER_AGENT = 'PixivIOSApp/7.13.3 (iOS 14.6; iPhone13,2)';
const BROWSER_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const AUTH_TOKEN_URL = 'https://oauth.secure.pixiv.net/auth/token';
const CLIENT_ID = 'MOBrBDS8blbauoSck0ZfDbtuzpyT';
const CLIENT_SECRET = 'lsACyCD94FhDUtGTXi3QzcFE2uU1hqtDaKeqrdwj';
const REDIRECT_URI = 'https://app-api.pixiv.net/web/v1/users/auth/pixiv/callback';
const LOGIN_URL = 'https://app-api.pixiv.net/web/v1/login';

// Host the OAuth callback must land on for a code to be considered valid
const CALLBACK_HOST = 'app-api.pixiv.net';

// Common Chrome flags for a clean, automation-resistant browser
const BROWSER_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-blink-features=AutomationControlled',
  '--disable-dev-shm-usage',
  '--disable-accelerated-2d-canvas',
  '--no-first-run',
  '--disable-gpu',
];

/**
 * Build the Pixiv OAuth login URL with PKCE parameters
 * @param {string} codeChallenge - S256 code challenge
 * @returns {string} Login URL
 */
function buildLoginUrl(codeChallenge) {
  const loginParams = new URLSearchParams({
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    client: 'pixiv-android',
  });
  return LOGIN_URL + '?' + loginParams.toString();
}

/**
 * Launch a configured Puppeteer browser.
 * Puppeteer is required lazily so CLI help/version paths work
 * without dependencies installed.
 * @param {Object} [options]
 * @param {boolean} [options.headless=false] - Run in headless mode
 * @returns {Promise<import('puppeteer').Browser>}
 */
async function launchBrowser({ headless = false } = {}) {
  const puppeteer = require('puppeteer');
  return puppeteer.launch({
    headless: Boolean(headless),
    args: BROWSER_ARGS.concat(headless ? ['--no-zygote'] : []),
    ignoreHTTPSErrors: true,
  });
}

/**
 * Prepare a page with a realistic UA and headers, then open the login page
 * @param {import('puppeteer').Browser} browser
 * @param {string} loginUrl
 * @returns {Promise<import('puppeteer').Page>}
 */
async function openLoginPage(browser, loginUrl) {
  const page = await browser.newPage();
  await page.setUserAgent(BROWSER_USER_AGENT);
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9',
  });
  try {
    await page.goto(loginUrl, { waitUntil: 'networkidle2', timeout: 60000 });
  } catch (error) {
    await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  }
  return page;
}

/**
 * Extract an OAuth parameter from a URL, only if the URL points at the
 * Pixiv callback host (avoids false positives from unrelated requests).
 * @param {string} url
 * @param {'code'|'error'} param
 * @returns {string|null}
 */
function extractOAuthParam(url, param) {
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname !== CALLBACK_HOST) return null;
    return urlObj.searchParams.get(param);
  } catch (e) {
    return null;
  }
}

/**
 * Generate PKCE code verifier (cryptographically secure)
 * @returns {string} Code verifier
 */
function generateCodeVerifier() {
  // 64 random bytes, base64url encoded -> 86-char verifier, well within
  // the RFC 7636 43-128 char range and unguessable.
  return crypto.randomBytes(64).toString('base64url');
}

/**
 * Generate PKCE code challenge
 * @param {string} verifier - Code verifier
 * @returns {string} Code challenge
 */
function generateCodeChallenge(verifier) {
  const hash = crypto.createHash('sha256').update(verifier).digest();
  return hash.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Wait for the OAuth redirect carrying the authorization code (or error).
 * @param {import('puppeteer').Page} page - Puppeteer page object
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise<{code: string|null, error: string|null}>}
 */
function waitForAuthCode(page, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      clearInterval(pollInterval);
      try {
        page.off('response', onResponse);
        page.off('framenavigated', onFrameNavigated);
      } catch (e) {
        // Ignore cleanup errors
      }
      resolve(result);
    };

    const check = (url) => {
      const error = extractOAuthParam(url, 'error');
      if (error) return { error };
      const code = extractOAuthParam(url, 'code');
      if (code) return { code };
      return null;
    };

    const timeout = setTimeout(() => finish({ code: null, error: null }), timeoutMs);

    // Poll URL periodically (covers cases where events are missed)
    const pollInterval = setInterval(() => {
      const result = check(page.url());
      if (result) finish({ code: result.code || null, error: result.error || null });
    }, 1000);

    const onResponse = (response) => {
      const result = check(response.url());
      if (result) finish({ code: result.code || null, error: result.error || null });
    };

    const onFrameNavigated = (frame) => {
      if (frame !== page.mainFrame()) return;
      const result = check(frame.url());
      if (result) finish({ code: result.code || null, error: result.error || null });
    };

    // Check current URL immediately
    const immediate = check(page.url());
    if (immediate) {
      finish({ code: immediate.code || null, error: immediate.error || null });
      return;
    }

    page.on('response', onResponse);
    page.on('framenavigated', onFrameNavigated);
  });
}

/**
 * Exchange authorization code for token
 * @param {string} code - Authorization code
 * @param {string} codeVerifier - Code verifier
 * @returns {Promise<Object>} Token information
 */
async function exchangeCodeForToken(code, codeVerifier) {
  const axios = require('axios');
  try {
    const response = await axios.post(
      AUTH_TOKEN_URL,
      new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code: code,
        code_verifier: codeVerifier,
        grant_type: 'authorization_code',
        include_policy: 'true',
        redirect_uri: REDIRECT_URI,
      }).toString(),
      {
        headers: {
          'user-agent': USER_AGENT,
          'app-os-version': '14.6',
          'app-os': 'ios',
          'content-type': 'application/x-www-form-urlencoded',
        },
        timeout: 30000,
      }
    );

    const data = response.data;

    if (!data.access_token || !data.refresh_token) {
      throw new Error('Token response missing required fields');
    }

    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
      token_type: data.token_type || 'bearer',
      scope: data.scope || '',
      user: data.user,
    };
  } catch (error) {
    if (axios.isAxiosError && axios.isAxiosError(error) && error.response) {
      const status = error.response.status;
      const statusText = error.response.statusText;
      const data = error.response.data;
      throw new Error('Token exchange failed: ' + status + ' ' + statusText + '. ' + (data ? JSON.stringify(data) : ''));
    }
    throw new Error('Token exchange failed: ' + error.message);
  }
}

/**
 * Interactive login options
 * @typedef {Object} InteractiveLoginOptions
 * @property {boolean} [headless=false] - Use headless mode
 * @property {number} [timeout=300000] - Timeout in milliseconds, default 5 minutes
 * @property {Function} [onBrowserOpen] - Callback when browser opens
 * @property {Function} [onPageReady] - Callback when page is ready
 */

/**
 * Interactive login (opens browser window)
 * @param {InteractiveLoginOptions} [options={}] - Login options
 * @returns {Promise<Object>} Token information
 * @example
 * const token = await loginInteractive();
 * console.log(token.access_token);
 */
async function loginInteractive(options = {}) {
  const {
    headless = false,
    timeout = 300000,
    onBrowserOpen,
    onPageReady,
  } = options;

  let browser = null;

  try {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const loginUrl = buildLoginUrl(codeChallenge);

    browser = await launchBrowser({ headless });

    if (onBrowserOpen) {
      onBrowserOpen(browser);
    }

    const page = await openLoginPage(browser, loginUrl);

    if (onPageReady) {
      onPageReady(page, loginUrl);
    }

    const { code, error } = await waitForAuthCode(page, timeout);

    if (error) {
      throw new Error('Login failed: Pixiv returned an OAuth error ("' + error + '"). Please try again.');
    }

    if (!code) {
      throw new Error('Failed to get authorization code. Login may have been cancelled or timed out. Please try again.');
    }

    const tokenInfo = await exchangeCodeForToken(code, codeVerifier);

    try {
      await browser.close();
      browser = null;
    } catch (e) {
      // Ignore cleanup errors
    }

    return tokenInfo;
  } catch (error) {
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        // Ignore cleanup errors
      }
    }
    throw error;
  }
}

/**
 * Find the first matching element and type text into it
 * @param {import('puppeteer').Page} page
 * @param {string[]} selectors - Selectors to try in order
 * @param {string} text - Text to type
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
    } catch (e) {
      // Try next selector
    }
  }
  return null;
}

/**
 * Headless login options
 * @typedef {Object} HeadlessLoginOptions
 * @property {string} username - Username
 * @property {string} password - Password
 * @property {number} [timeout=120000] - Timeout in milliseconds, default 2 minutes
 */

/**
 * Headless login (using username/password)
 * @param {HeadlessLoginOptions} options - Login options
 * @returns {Promise<Object>} Token information
 * @example
 * const token = await loginHeadless({
 *   username: 'your_username',
 *   password: 'your_password'
 * });
 * console.log(token.access_token);
 */
async function loginHeadless(options) {
  const {
    username,
    password,
    timeout = 120000,
  } = options;

  if (!username || username.trim() === '') {
    throw new Error('Username cannot be empty');
  }
  if (!password || password.trim() === '') {
    throw new Error('Password cannot be empty');
  }

  let browser = null;

  try {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const loginUrl = buildLoginUrl(codeChallenge);

    browser = await launchBrowser({ headless: true });
    const page = await openLoginPage(browser, loginUrl);

    // Wait for login form to load
    await page.waitForSelector('input[type="text"], input[autocomplete="username"]', { timeout: 30000 });

    const usernameField = await typeIntoFirstMatch(page, [
      'input[autocomplete="username"]',
      'input[type="text"]',
      'input[name="pixiv_id"]',
      '#LoginComponent input[type="text"]',
    ], username);

    if (!usernameField) {
      throw new Error('Could not find username input field');
    }

    const passwordField = await typeIntoFirstMatch(page, [
      'input[autocomplete="current-password"]',
      'input[type="password"]',
      'input[name="password"]',
      '#LoginComponent input[type="password"]',
    ], password);

    if (!passwordField) {
      throw new Error('Could not find password input field');
    }

    // Submit form
    let submitted = false;
    for (const selector of [
      'button[type="submit"]',
      'input[type="submit"]',
      '#LoginComponent button[type="submit"]',
    ]) {
      try {
        const submitButton = await page.$(selector);
        if (submitButton) {
          await submitButton.click();
          submitted = true;
          break;
        }
      } catch (e) {
        // Try next selector
      }
    }

    if (!submitted) {
      await passwordField.press('Enter');
    }

    const { code, error } = await waitForAuthCode(page, timeout);

    if (error) {
      throw new Error('Login failed: Pixiv returned an OAuth error ("' + error + '"). Please check your credentials.');
    }

    if (!code) {
      throw new Error('Failed to get authorization code. Please check your credentials.');
    }

    const tokenInfo = await exchangeCodeForToken(code, codeVerifier);

    try {
      await browser.close();
      browser = null;
    } catch (e) {
      // Ignore cleanup errors
    }

    return tokenInfo;
  } catch (error) {
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        // Ignore cleanup errors
      }
    }
    throw error;
  }
}

module.exports = {
  loginInteractive,
  loginHeadless,
  generateCodeVerifier,
  generateCodeChallenge,
  exchangeCodeForToken,
};
