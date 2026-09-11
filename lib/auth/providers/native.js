/**
 * Native provider — Pixiv's own OAuth/PKCE flow driven by Puppeteer.
 *
 * This is the default, first-class provider. It is the ONLY provider that can
 * also harvest the Pixiv web session cookie (PHPSESSID).
 *
 * Methods:
 *  - 'oauth' / 'browser': open the Pixiv login page and let the user log in
 *                        manually (the two names are aliases).
 *  - 'e2e':               automate the username/password form (headless by
 *                        default), with optional TOTP second factor.
 */

const {
  generateCodeVerifier,
  generateCodeChallenge,
  buildLoginUrl,
} = require('../oauth/pkce');
const { exchangeCodeForToken } = require('../oauth/token-exchange');
const { loginInteractive, loginHeadless } = require('../../browser/login-flow');
const { resolveSecondFactorCode } = require('../../browser/second-factor');
const { LoginError } = require('../../errors');

/** provider id exposed on TokenInfo */
const id = 'native';

/** Methods this provider implements. */
const methods = ['oauth', 'browser', 'e2e'];

/**
 * @returns {Promise<boolean>} whether Puppeteer is resolvable
 */
async function isAvailable() {
  const { isPuppeteerAvailable } = require('../../browser/puppeteer');
  return isPuppeteerAvailable();
}

/**
 * Perform a login.
 *
 * @param {Object} options
 * @param {('oauth'|'browser'|'e2e')} [options.method='oauth']
 * @param {string} [options.profile='default']
 * @param {string} [options.username]
 * @param {string} [options.password]
 * @param {string} [options.totpCode]
 * @param {string} [options.totpSecret] explicit opt-in only
 * @param {() => Promise<string>} [options.totpPrompt] called only when Pixiv asks
 * @param {number} [options.timeout]
 * @param {string} [options.userDataDir]
 * @param {any} [options.proxy]
 * @param {boolean} [options.headless]
 * @param {(browser: any) => void} [options.onBrowserOpen]
 * @param {(page: any, url: string) => void} [options.onPageReady]
 * @param {(req: any) => Promise<any>} [options.transport] injectable HTTP (tests)
 * @returns {Promise<import('../token/token-info').TokenInfo>}
 */
async function login(options = {}) {
  const method = normalizeMethod(options.method);
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const loginUrl = buildLoginUrl(codeChallenge);

  const runner = method === 'e2e' ? loginHeadless : loginInteractive;

  const { token, webCookies } = await runner({
    ...options,
    loginUrl,
    codeVerifier,
    codeChallenge,
    generateCodeVerifier,
    generateCodeChallenge,
    buildLoginUrl,
    exchange: (code, verifier) =>
      exchangeCodeForToken(code, verifier, {
        transport: options.transport,
        proxy: options.proxy,
        provider: id,
        method,
      }),
  });

  // Attach provider metadata + web cookies (native-only capability).
  token.provider = id;
  token.method = method;
  if (webCookies && Object.keys(webCookies).length > 0) {
    token.web_cookies = webCookies;
  }
  return token;
}

/**
 * Refresh using the shared Pixiv token endpoint (no browser involved).
 *
 * @param {string} refreshToken
 * @param {Object} [options]
 * @returns {Promise<import('../token/token-info').TokenInfo>}
 */
async function refresh(refreshToken, options = {}) {
  const { refreshAccessToken } = require('../oauth/token-exchange');
  const token = await refreshAccessToken(refreshToken, { ...options, provider: id });
  token.provider = id;
  return token;
}

/**
 * @param {string|undefined} method
 * @returns {'oauth'|'browser'|'e2e'}
 */
function normalizeMethod(method) {
  if (!method) return 'oauth';
  const value = String(method).toLowerCase();
  if (value === 'oauth' || value === 'browser' || value === 'e2e') return value;
  throw new LoginError(
    `Unsupported native method "${method}". Expected one of: oauth, browser, e2e`
  );
}

/**
 * Resolve a second factor code, or explain precisely what is missing.
 * Re-exported from the browser layer so there is a single implementation.
 *
 * @param {Object} options
 * @returns {Promise<string>}
 */
const resolveSecondFactor = resolveSecondFactorCode;

module.exports = {
  id,
  methods,
  isAvailable,
  login,
  refresh,
  normalizeMethod,
  resolveSecondFactor,
  // Re-exported so the legacy shim and tests can reach them without a browser.
  generateCodeVerifier,
  generateCodeChallenge,
  buildLoginUrl,
};
