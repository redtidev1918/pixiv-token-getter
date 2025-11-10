/**
 * Pixiv Authentication API
 * Core API for getting Pixiv tokens
 */

const puppeteer = require('puppeteer');
const axios = require('axios');
const crypto = require('crypto');

// Pixiv OAuth constants
const USER_AGENT = 'PixivIOSApp/7.13.3 (iOS 14.6; iPhone13,2)';
const AUTH_TOKEN_URL = 'https://oauth.secure.pixiv.net/auth/token';
const CLIENT_ID = 'MOBrBDS8blbauoSck0ZfDbtuzpyT';
const CLIENT_SECRET = 'lsACyCD94FhDUtGTXi3QzcFE2uU1hqtDaKeqrdwj';
const REDIRECT_URI = 'https://app-api.pixiv.net/web/v1/users/auth/pixiv/callback';
const LOGIN_URL = 'https://app-api.pixiv.net/web/v1/login';

/**
 * Generate PKCE code verifier
 * @returns {string} Code verifier
 */
function generateCodeVerifier() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let result = '';
  for (let i = 0; i < 128; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
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
 * Wait for authorization code
 * @param {import('puppeteer').Page} page - Puppeteer page object
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise<string|null>} Authorization code or null
 */
function waitForAuthCode(page, timeoutMs) {
  return new Promise((resolve) => {
    let resolved = false;
    let pollInterval = null;

    const cleanup = () => {
      if (resolved) return;
      resolved = true;
      try {
        page.off('response', onResponse);
        page.off('framenavigated', onFrameNavigated);
        if (pollInterval) {
          clearInterval(pollInterval);
          pollInterval = null;
        }
      } catch (e) {
        // Ignore cleanup errors
      }
    };

    const timeout = setTimeout(() => {
      if (!resolved) {
        cleanup();
        resolve(null);
      }
    }, timeoutMs);

    const checkUrlForCode = (url) => {
      try {
        const urlObj = new URL(url);
        const code = urlObj.searchParams.get('code');
        if (code) {
          return code;
        }
      } catch (e) {
        // Invalid URL, ignore
      }
      return null;
    };

    // Check current URL immediately
    try {
      const currentUrl = page.url();
      const currentCode = checkUrlForCode(currentUrl);
      if (currentCode) {
        cleanup();
        clearTimeout(timeout);
        resolve(currentCode);
        return;
      }
    } catch (e) {
      // Continue using listeners
    }

    // Listen for response events
    const onResponse = async (response) => {
      if (resolved) return;
      try {
        const url = response.url();
        const code = checkUrlForCode(url);
        if (code) {
          cleanup();
          clearTimeout(timeout);
          resolve(code);
        }
      } catch (e) {
        // Ignore errors
      }
    };

    // Listen for navigation events
    const onFrameNavigated = async (frame) => {
      if (resolved || frame !== page.mainFrame()) return;
      try {
        const url = frame.url();
        const code = checkUrlForCode(url);
        if (code) {
          cleanup();
          clearTimeout(timeout);
          resolve(code);
        }
      } catch (e) {
        // Ignore errors
      }
    };

    // Poll URL periodically
    pollInterval = setInterval(async () => {
      if (resolved) {
        if (pollInterval) {
          clearInterval(pollInterval);
        }
        return;
      }

      try {
        const url = page.url();
        const code = checkUrlForCode(url);
        if (code) {
          cleanup();
          clearTimeout(timeout);
          resolve(code);
        }
      } catch (e) {
        // Ignore errors
      }
    }, 1000); // Check every second

    // Set up listeners
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
    if (axios.isAxiosError(error) && error.response) {
      const status = error.response.status;
      const statusText = error.response.statusText;
      const data = error.response.data;
      throw new Error(`Token exchange failed: ${status} ${statusText}. ${data ? JSON.stringify(data) : ''}`);
    }
    throw new Error(`Token exchange failed: ${error.message}`);
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
    // Generate PKCE parameters
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    // Build login URL
    const loginParams = new URLSearchParams({
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      client: 'pixiv-android',
    });
    const loginUrl = `${LOGIN_URL}?${loginParams.toString()}`;

    // Launch browser
    const launchOptions = {
      headless: headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--disable-gpu',
      ],
      ignoreHTTPSErrors: true,
    };

    browser = await puppeteer.launch(launchOptions);
    
    if (onBrowserOpen) {
      onBrowserOpen(browser);
    }

    const page = await browser.newPage();

    // Set User-Agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Set extra HTTP headers
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    });

    // Navigate to login page
    try {
      await page.goto(loginUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    } catch (error) {
      await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    }

    if (onPageReady) {
      onPageReady(page, loginUrl);
    }

    // Wait for authorization code
    const code = await waitForAuthCode(page, timeout);

    if (!code) {
      // Try to extract code from current URL again
      const currentUrl = page.url();
      try {
        const urlObj = new URL(currentUrl);
        const codeFromUrl = urlObj.searchParams.get('code');
        if (codeFromUrl) {
          const tokenInfo = await exchangeCodeForToken(codeFromUrl, codeVerifier);
          await browser.close();
          browser = null;
          return tokenInfo;
        }
      } catch (e) {
        // URL parsing failed
      }

      throw new Error('Failed to get authorization code. Login may have been cancelled or timed out. Please try again.');
    }

    // Exchange code for token
    const tokenInfo = await exchangeCodeForToken(code, codeVerifier);

    // Close browser
    try {
      await browser.close();
      browser = null;
    } catch (e) {
      // Ignore cleanup errors
    }

    return tokenInfo;
  } catch (error) {
    // Cleanup resources
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
    // Generate PKCE parameters
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    // Build login URL
    const loginParams = new URLSearchParams({
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      client: 'pixiv-android',
    });
    const loginUrl = `${LOGIN_URL}?${loginParams.toString()}`;

    // Launch browser (headless mode)
    const launchOptions = {
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
      ],
      ignoreHTTPSErrors: true,
    };

    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();

    // Set User-Agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Set extra HTTP headers
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
    });

    // Navigate to login page
    try {
      await page.goto(loginUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    } catch (error) {
      await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    }

    // Wait for login form to load
    await page.waitForSelector('input[type="text"], input[autocomplete="username"]', { timeout: 30000 });

    // Fill credentials
    const usernameSelectors = [
      'input[autocomplete="username"]',
      'input[type="text"]',
      'input[name="pixiv_id"]',
      '#LoginComponent input[type="text"]',
    ];

    let usernameField = null;
    for (const selector of usernameSelectors) {
      try {
        usernameField = await page.$(selector);
        if (usernameField) {
          await usernameField.type(username, { delay: 100 });
          break;
        }
      } catch (e) {
        // Try next selector
      }
    }

    if (!usernameField) {
      throw new Error('Could not find username input field');
    }

    const passwordSelectors = [
      'input[autocomplete="current-password"]',
      'input[type="password"]',
      'input[name="password"]',
      '#LoginComponent input[type="password"]',
    ];

    let passwordField = null;
    for (const selector of passwordSelectors) {
      try {
        passwordField = await page.$(selector);
        if (passwordField) {
          await passwordField.type(password, { delay: 100 });
          break;
        }
      } catch (e) {
        // Try next selector
      }
    }

    if (!passwordField) {
      throw new Error('Could not find password input field');
    }

    // Submit form
    const submitSelectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      '#LoginComponent button[type="submit"]',
    ];

    let submitted = false;
    for (const selector of submitSelectors) {
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

    // Wait for authorization code
    const code = await waitForAuthCode(page, timeout);

    if (!code) {
      throw new Error('Failed to get authorization code. Please check your credentials.');
    }

    // Exchange code for token
    const tokenInfo = await exchangeCodeForToken(code, codeVerifier);

    // Close browser
    await browser.close();
    browser = null;

    return tokenInfo;
  } catch (error) {
    // Cleanup resources
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

