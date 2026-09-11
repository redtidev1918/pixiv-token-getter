/**
 * Pixiv Token Getter — Node.js Pixiv credential manager and authentication facade.
 *
 * Two layers are exported:
 *
 *  1. HIGH-LEVEL (recommended): a credential lifecycle.
 *       getToken()  → cached → refresh → login, then persist
 *       login()     → force a fresh login
 *       refreshToken() / refreshStoredToken() → renew
 *       status()    → inspect without leaking secrets
 *       logout()    → remove stored credentials
 *
 *  2. LEGACY: the original one-shot helpers, unchanged and still supported.
 *       getTokenInteractive(), getTokenHeadless(), loginInteractive(), loginHeadless()
 *
 * @module pixiv-token-getter
 */

const lifecycle = require('./auth/token/lifecycle');
const tokenInfo = require('./auth/token/token-info');
const tokenStore = require('./auth/token/store');
const profileStore = require('./auth/profile/profile-store');
const { refreshAccessToken } = require('./auth/oauth/token-exchange');
const providers = require('./auth/providers');
const gpptProvider = require('./auth/providers/gppt');
const proxyModule = require('./auth/proxy/proxy');
const pkce = require('./auth/oauth/pkce');
const constants = require('./auth/oauth/constants');
const paths = require('./paths');
const { maskSecret } = require('./util/secret');
const errors = require('./errors');
const legacy = require('./pixiv-auth');

const { version } = require('../package.json');

// ---------------------------------------------------------------------------
// High-level lifecycle API
// ---------------------------------------------------------------------------

/**
 * Get a usable token for a profile, following the credential lifecycle:
 * cached → refresh → login. This is the recommended entry point.
 * @type {typeof lifecycle.getToken}
 */
const getToken = lifecycle.getToken;

/** Resolve a token together with its provenance (`cache` | `refresh` | `login`). */
const resolveToken = lifecycle.resolveToken;

/**
 * Force a fresh login (bypassing cache and refresh) and persist the token.
 * @type {typeof lifecycle.login}
 */
const login = lifecycle.login;

/** Refresh the STORED token for a profile. */
const refreshStoredToken = lifecycle.refreshStoredToken;

/** Inspect a profile without revealing secrets. */
const status = lifecycle.status;

/** Remove stored credentials (optionally purging profile + browser profile). */
const logout = lifecycle.logout;

/**
 * Refresh an access token directly, without touching the store.
 * @param {string} refreshTokenValue
 * @param {Object} [options]
 * @returns {Promise<import('./auth/token/token-info').TokenInfo>}
 */
function refreshToken(refreshTokenValue, options = {}) {
  return refreshAccessToken(refreshTokenValue, options);
}

/**
 * Import an existing gppt credential into this package's store.
 * @param {Object} [options]
 * @param {string} [options.profile='default']        destination profile
 * @param {string} [options.sourceProfile='default']  gppt profile to read
 * @param {import('./auth/token/store').TokenStore} [options.store]
 * @returns {Promise<import('./auth/token/token-info').TokenInfo>}
 */
async function importGppt(options = {}) {
  const token = await gpptProvider.login({ ...options, method: 'import' });
  const store = options.store || new tokenStore.FileTokenStore();
  await store.save(options.profile || 'default', token);
  return token;
}

/**
 * Legacy: get a token via interactive login.
 * @type {typeof legacy.loginInteractive}
 */
async function getTokenInteractive(options = {}) {
  return legacy.loginInteractive(options);
}

/**
 * Legacy: get a token via headless username/password login.
 * @param {Object} options
 * @returns {Promise<Object>}
 */
async function getTokenHeadless(options) {
  if (!options || !options.username || !options.password) {
    throw new errors.LoginError('Username and password are required for headless login');
  }
  return legacy.loginHeadless(options);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  version,

  // ---- high-level lifecycle (recommended) ----
  getToken,
  resolveToken,
  login,
  refreshToken,
  refreshStoredToken,
  status,
  logout,

  // ---- providers ----
  providers,
  getProvider: providers.getProvider,
  providerPlan: providers.providerPlan,
  PROVIDER_IDS: profileStore.PROVIDER_IDS,
  AUTH_METHODS: profileStore.AUTH_METHODS,

  // ---- gppt interoperability (optional) ----
  gppt: gpptProvider,
  importGppt,

  // ---- profiles ----
  loadProfile: profileStore.loadProfile,
  saveProfile: profileStore.saveProfile,
  listProfiles: profileStore.listProfiles,
  removeProfile: profileStore.removeProfile,
  defaultProfile: profileStore.defaultProfile,

  // ---- token persistence ----
  FileTokenStore: tokenStore.FileTokenStore,
  MemoryTokenStore: tokenStore.MemoryTokenStore,

  // ---- token utilities ----
  isTokenExpired: tokenInfo.isTokenExpired,
  msUntilExpiry: tokenInfo.msUntilExpiry,
  normalizeTokenInfo: tokenInfo.normalizeTokenInfo,
  TOKEN_EXPIRY_SKEW_MS: tokenInfo.TOKEN_EXPIRY_SKEW_MS,

  // ---- OAuth primitives (advanced) ----
  generateCodeVerifier: pkce.generateCodeVerifier,
  generateCodeChallenge: pkce.generateCodeChallenge,
  buildLoginUrl: pkce.buildLoginUrl,
  exchangeCodeForToken: legacy.exchangeCodeForToken,
  constants,

  // ---- proxy ----
  resolveProxy: proxyModule.resolveProxy,
  redactProxyUrl: proxyModule.redactProxyUrl,

  // ---- secrets ----
  maskSecret,

  // ---- paths (advanced / tests) ----
  paths,

  // ---- errors ----
  ...errors,

  // ---- LEGACY API (unchanged, still supported) ----
  getTokenInteractive,
  getTokenHeadless,
  loginInteractive: legacy.loginInteractive,
  loginHeadless: legacy.loginHeadless,
  collectWebCookies: legacy.collectWebCookies,
  DEFAULT_USER_DATA_DIR: legacy.DEFAULT_USER_DATA_DIR,
};

// Default export (legacy shape + new entry points)
module.exports.default = {
  getTokenInteractive,
  getTokenHeadless,
  getToken,
  login,
  refreshToken,
  refreshStoredToken,
  status,
  logout,
  importGppt,
};
