/**
 * LEGACY authentication API (kept for backward compatibility).
 *
 * This module used to hold the whole implementation. It is now a thin shim over
 * the layered implementation so that existing consumers keep working unchanged:
 *
 *   loginInteractive() / loginHeadless()
 *   generateCodeVerifier() / generateCodeChallenge()
 *   exchangeCodeForToken() / collectWebCookies() / DEFAULT_USER_DATA_DIR
 *
 * New code should prefer `require('pixiv-token-getter').getToken()`.
 */

const native = require('./auth/providers/native');
const { exchangeCodeForToken: exchangeInternal } = require('./auth/oauth/token-exchange');
const { collectWebCookies } = require('./browser/cookies');
const puppeteerModule = require('./browser/puppeteer');
const {
  generateCodeVerifier,
  generateCodeChallenge,
  buildLoginUrl,
  extractOAuthParam,
  parseCallbackUrl,
} = require('./auth/oauth/pkce');
const { waitForAuthCode } = require('./browser/auth-code');
const { LoginError } = require('./errors');

/** @type {string} */
const DEFAULT_USER_DATA_DIR = puppeteerModule.DEFAULT_USER_DATA_DIR;

/**
 * Legacy interactive login. Opens a browser window and waits for the user.
 *
 * @param {Object} [options]
 * @param {boolean} [options.headless=false]
 * @param {number} [options.timeout=300000]
 * @param {string} [options.userDataDir]
 * @param {Function} [options.onBrowserOpen]
 * @param {Function} [options.onPageReady]
 * @param {any} [options.proxy]
 * @returns {Promise<Object>} token info (superset of the historical shape)
 */
async function loginInteractive(options = {}) {
  const token = await native.login({ ...options, method: 'browser' });
  // Legacy contract: web_cookies is always present (possibly empty).
  token.web_cookies = token.web_cookies || {};
  return token;
}

/**
 * Legacy headless login with username/password.
 *
 * @param {Object} options
 * @param {string} options.username
 * @param {string} options.password
 * @param {number} [options.timeout=120000]
 * @param {string} [options.userDataDir]
 * @param {string} [options.totpCode]   new: TOTP second factor
 * @param {() => Promise<string>} [options.totpPrompt] new: lazy second factor
 * @returns {Promise<Object>} token info (superset of the historical shape)
 */
async function loginHeadless(options = {}) {
  if (!options.username || String(options.username).trim() === '') {
    throw new LoginError('Username cannot be empty');
  }
  if (!options.password || String(options.password).trim() === '') {
    throw new LoginError('Password cannot be empty');
  }
  const token = await native.login({ ...options, method: 'e2e' });
  token.web_cookies = token.web_cookies || {};
  return token;
}

/**
 * Legacy code exchange. Returns exactly the historical field set.
 *
 * @param {string} code
 * @param {string} codeVerifier
 * @returns {Promise<Object>}
 */
async function exchangeCodeForToken(code, codeVerifier) {
  const token = await exchangeInternal(code, codeVerifier, { requireRefreshToken: true });
  const legacy = {
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expires_in: token.expires_in,
    token_type: token.token_type,
    scope: token.scope,
    user: token.user,
  };
  // Superset (additive) fields, safe for consumers that ignore unknowns.
  legacy.expires_at = token.expires_at;
  legacy.obtained_at = token.obtained_at;
  return legacy;
}

module.exports = {
  loginInteractive,
  loginHeadless,
  generateCodeVerifier,
  generateCodeChallenge,
  buildLoginUrl,
  extractOAuthParam,
  parseCallbackUrl,
  waitForAuthCode,
  exchangeCodeForToken,
  collectWebCookies,
  DEFAULT_USER_DATA_DIR,
};
