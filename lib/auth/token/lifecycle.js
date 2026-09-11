/**
 * Token lifecycle — the layer that turns this package from a
 * "get a token once" tool into a credential manager.
 *
 *   load profile
 *     ↓
 *   load cached token ──valid──▶ return cached
 *     ↓ invalid / missing
 *   have refresh_token? ──yes──▶ refresh ──▶ save ──▶ return
 *     ↓ no / refresh failed
 *   login (selected provider) ──▶ save ──▶ return
 *
 * `refreshOnly` short-circuits step 3 so unattended servers fail visibly
 * instead of spawning a browser (see README "Server / headless runtimes").
 */

const fs = require('fs');

const { MemoryTokenStore, FileTokenStore } = require('./store');
const { isTokenExpired, msUntilExpiry, TOKEN_EXPIRY_SKEW_MS } = require('./token-info');
const { refreshAccessToken } = require('../oauth/token-exchange');
const { loginWithFallback } = require('../providers');
const {
  loadProfile,
  saveProfile,
  removeProfile,
  listProfiles,
} = require('../profile/profile-store');
const { assertValidProfileName, getTokenFilePath, getBrowserDir } = require('../../paths');
const { RefreshError, ProfileError } = require('../../errors');

/**
 * @typedef {Object} GetTokenOptions
 * @property {string} [profile='default']
 * @property {('native'|'gppt'|'auto')} [provider]   overrides the profile setting
 * @property {('oauth'|'browser'|'e2e'|'import')} [method]
 * @property {boolean} [force=false]                 skip cache AND refresh, log in again
 * @property {boolean} [refreshOnly=false]           never attempt an interactive login
 * @property {number} [skewMs]                       expiry safety margin
 * @property {import('./store').TokenStore} [store]
 * @property {(req: any) => Promise<any>} [transport] injectable HTTP transport
 * @property {(event: { type: string, [key: string]: any }) => void} [onEvent]
 */

/**
 * Resolve a token together with metadata about HOW it was obtained.
 *
 * @param {GetTokenOptions & Record<string, any>} [options]
 * @returns {Promise<{ token: import('./token-info').TokenInfo, source: 'cache'|'refresh'|'login', providerId?: string }>}
 */
async function resolveToken(options = {}) {
  const profileName = assertValidProfileName(options.profile || 'default');
  const store = options.store || new FileTokenStore();
  const profile = options.profileConfig || (await loadProfile(profileName, { dir: options.profileDir }));

  const providerId = options.provider || profile.provider || 'native';
  const method = options.method || profile.method || undefined;
  const skewMs = options.skewMs === undefined ? TOKEN_EXPIRY_SKEW_MS : options.skewMs;

  const emit = (type, payload = {}) => {
    if (typeof options.onEvent === 'function') options.onEvent({ type, ...payload });
  };

  let cached = null;
  if (!options.force) {
    cached = await store.load(profileName);
    // `refreshOnly` deliberately ignores a still-valid cached token: the caller
    // explicitly asked for a refresh (e.g. a proactive cron job).
    if (cached && !options.refreshOnly && !isTokenExpired(cached, skewMs)) {
      emit('cache_hit', { profile: profileName });
      return { token: cached, source: 'cache', providerId: cached.provider || providerId };
    }
    if (cached && !options.refreshOnly) emit('cache_stale', { profile: profileName });
  }

  // ---- refresh ------------------------------------------------------------
  if (!options.force && cached && cached.refresh_token) {
    try {
      const refreshed = await refreshAccessToken(cached.refresh_token, {
        previous: cached,
        transport: options.transport,
        proxy: options.proxy === undefined ? profile.proxy : options.proxy,
        provider: cached.provider || providerId,
        method: cached.method || method,
      });
      refreshed.provider = cached.provider || providerId;
      refreshed.method = cached.method || method;
      refreshed.last_refreshed_at = new Date().toISOString();
      // Persist ONLY after a fully successful, usable refresh.
      await store.save(profileName, refreshed);
      emit('refreshed', { profile: profileName, expiresAt: refreshed.expires_at });
      return { token: refreshed, source: 'refresh', providerId: refreshed.provider };
    } catch (error) {
      emit('refresh_failed', { profile: profileName, error });
      if (options.refreshOnly) throw error;
      // Otherwise fall through to a login.
    }
  } else if (options.refreshOnly) {
    throw new RefreshError(
      cached
        ? `Stored token for profile "${profileName}" has no refresh_token. Run "ptg login --profile ${profileName}".`
        : `No stored token for profile "${profileName}". Run "ptg login --profile ${profileName}" first.`,
      { details: { profile: profileName } }
    );
  }

  // ---- login --------------------------------------------------------------
  const { token, providerId: usedProvider } = await loginWithFallback({
    ...options,
    provider: providerId,
    method,
    profile: profileName,
    profileConfig: profile,
  });

  token.provider = usedProvider;
  token.method = token.method || method || (usedProvider === 'native' ? 'oauth' : 'import');

  // A refresh can never carry cookies; a re-login might lose them when the
  // browser profile was wiped. Preserve the previous web session if so.
  if (!token.web_cookies && cached && cached.web_cookies) {
    token.web_cookies = cached.web_cookies;
  }

  await store.save(profileName, token);
  emit('logged_in', { profile: profileName, provider: usedProvider });
  return { token, source: 'login', providerId: usedProvider };
}

/**
 * High-level, recommended API: get a usable token for a profile.
 *
 * @param {GetTokenOptions & Record<string, any>} [options]
 * @returns {Promise<import('./token-info').TokenInfo>}
 */
async function getToken(options = {}) {
  const { token } = await resolveToken(options);
  return token;
}

/**
 * Force a fresh login (no cache, no refresh) and persist the result.
 *
 * @param {GetTokenOptions & Record<string, any>} [options]
 * @returns {Promise<import('./token-info').TokenInfo>}
 */
async function login(options = {}) {
  const { token } = await resolveToken({ ...options, force: true, refreshOnly: false });
  return token;
}

/**
 * Refresh the stored token for a profile.
 *
 * @param {GetTokenOptions & Record<string, any>} [options]
 * @returns {Promise<import('./token-info').TokenInfo>}
 */
async function refreshStoredToken(options = {}) {
  const { token } = await resolveToken({ ...options, refreshOnly: true });
  return token;
}

/**
 * Remove stored credentials for a profile.
 *
 * @param {Object} [options]
 * @param {string} [options.profile='default']
 * @param {boolean} [options.purge=false] also delete profile prefs + browser profile
 * @param {import('./store').TokenStore} [options.store]
 * @returns {Promise<{ profile: string, tokenRemoved: boolean, profileRemoved: boolean, browserRemoved: boolean }>}
 */
async function logout(options = {}) {
  const profileName = assertValidProfileName(options.profile || 'default');
  const store = options.store || new FileTokenStore();

  const had = await store.load(profileName);
  await store.remove(profileName);

  let profileRemoved = false;
  let browserRemoved = false;

  if (options.purge) {
    await removeProfile(profileName, { dir: options.profileDir });
    profileRemoved = true;

    const browserDir = options.userDataDir || getBrowserDir(profileName);
    try {
      fs.rmSync(browserDir, { recursive: true, force: true });
      browserRemoved = true;
    } catch (error) {
      browserRemoved = false;
    }
  }

  return {
    profile: profileName,
    tokenRemoved: Boolean(had),
    profileRemoved,
    browserRemoved,
  };
}

/**
 * Inspect a profile WITHOUT revealing secrets.
 *
 * @param {Object} [options]
 * @param {string} [options.profile='default']
 * @param {import('./store').TokenStore} [options.store]
 * @param {number} [options.skewMs]
 * @returns {Promise<Object>}
 */
async function status(options = {}) {
  const profileName = assertValidProfileName(options.profile || 'default');
  const store = options.store || new FileTokenStore();
  const profile = await loadProfile(profileName, { dir: options.profileDir });
  const token = await store.load(profileName);

  if (!token) {
    return {
      profile: profileName,
      provider: profile.provider,
      method: profile.method,
      hasToken: false,
      accessToken: { present: false, valid: false },
      refreshToken: { present: false },
      webSession: { present: false, cookies: [] },
      tokenFile: options.store ? null : getTokenFilePath(profileName),
      browserDir: getBrowserDir(profileName),
    };
  }

  const remaining = msUntilExpiry(token);
  const cookies = token.web_cookies && Object.keys(token.web_cookies);

  return {
    profile: profileName,
    provider: token.provider || profile.provider,
    method: token.method || profile.method,
    hasToken: true,
    user: token.user || null,
    accessToken: {
      present: true,
      valid: !isTokenExpired(token, options.skewMs),
      expiresAt: token.expires_at || null,
      expiresIn: token.expires_in || null,
      msUntilExpiry: remaining,
    },
    refreshToken: { present: Boolean(token.refresh_token) },
    webSession: { present: Boolean(cookies && cookies.length), cookies: cookies || [] },
    obtainedAt: token.obtained_at || null,
    lastRefreshedAt: token.last_refreshed_at || null,
    tokenFile: options.store ? null : getTokenFilePath(profileName),
    browserDir: getBrowserDir(profileName),
  };
}

module.exports = {
  resolveToken,
  getToken,
  login,
  refreshStoredToken,
  logout,
  status,
  // re-exported for convenience / tests
  FileTokenStore,
  MemoryTokenStore,
  listProfiles,
  loadProfile,
  saveProfile,
};
