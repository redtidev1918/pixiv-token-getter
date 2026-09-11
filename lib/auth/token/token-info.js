/**
 * TokenInfo normalisation and expiry helpers.
 *
 * Design notes (borrowed from gppt v5's verified lifecycle):
 *  - `expires_in` is relative to the moment the token was issued; the ABSOLUTE
 *    `expires_at` is what we persist and compare against.
 *  - expiry is judged with a safety margin so we never hand a nearly-dead token
 *    to a downstream consumer.
 *  - a malformed / timezone-less `expires_at` is treated as expired rather than
 *    throwing (gppt has a latent TypeError here — we deliberately do not).
 */

/** Consider a token expired this long before its real expiry (ms). */
const TOKEN_EXPIRY_SKEW_MS = 300000; // 5 minutes

/**
 * @typedef {Object} TokenUser
 * @property {string} [id]
 * @property {string} [name]
 * @property {string} [account]
 */

/**
 * @typedef {Object} TokenInfo
 * @property {string} access_token
 * @property {string} refresh_token
 * @property {number} expires_in
 * @property {string} [expires_at]  absolute ISO-8601 expiry (with timezone)
 * @property {string} [obtained_at] absolute ISO-8601 issue time
 * @property {string} [token_type]
 * @property {string} [scope]
 * @property {TokenUser} [user]
 * @property {Record<string,string>} [web_cookies]
 * @property {string} [provider]
 * @property {string} [method]
 * @property {string} [last_refreshed_at]
 */

/**
 * Parse an ISO-8601 date, rejecting timezone-less strings.
 *
 * A naive string (e.g. "2024-01-01T00:00:00") compares against `Date.now()`
 * incorrectly, so we treat it as unparseable.
 *
 * @param {string|undefined|null} value
 * @returns {Date|null}
 */
function parseAbsoluteDate(value) {
  if (!value || typeof value !== 'string') return null;
  // Require an explicit timezone designator (Z or ±HH:MM).
  if (!/(Z|[+-]\d{2}:?\d{2})$/.test(value.trim())) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Compute the absolute expiry for a relative `expires_in`.
 * @param {number} expiresIn seconds
 * @param {Date} obtainedAt
 * @returns {string|undefined}
 */
function computeExpiresAt(expiresIn, obtainedAt) {
  const seconds = Number(expiresIn);
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  return new Date(obtainedAt.getTime() + seconds * 1000).toISOString();
}

/**
 * Is this token expired (or about to expire within `skewMs`)?
 *
 * @param {TokenInfo|null|undefined} token
 * @param {number} [skewMs=TOKEN_EXPIRY_SKEW_MS]
 * @returns {boolean}
 */
function isTokenExpired(token, skewMs = TOKEN_EXPIRY_SKEW_MS) {
  if (!token || !token.access_token) return true;

  const now = Date.now() + Math.max(0, Number(skewMs) || 0);

  const absolute = parseAbsoluteDate(token.expires_at);
  if (absolute) return absolute.getTime() <= now;

  const obtained = parseAbsoluteDate(token.obtained_at);
  const expiresIn = Number(token.expires_in);
  if (obtained && Number.isFinite(expiresIn) && expiresIn > 0) {
    return obtained.getTime() + expiresIn * 1000 <= now;
  }

  // No usable expiry information: be conservative so callers refresh/re-login.
  return true;
}

/**
 * Milliseconds until the token expires (negative when already expired).
 * Returns null when expiry cannot be determined.
 * @param {TokenInfo} token
 * @returns {number|null}
 */
function msUntilExpiry(token) {
  if (!token) return null;
  const absolute = parseAbsoluteDate(token.expires_at);
  if (absolute) return absolute.getTime() - Date.now();
  const obtained = parseAbsoluteDate(token.obtained_at);
  const expiresIn = Number(token.expires_in);
  if (obtained && Number.isFinite(expiresIn) && expiresIn > 0) {
    return obtained.getTime() + expiresIn * 1000 - Date.now();
  }
  return null;
}

/**
 * Remove keys whose value is `undefined`.
 * @template {object} T
 * @param {T} obj
 * @returns {T}
 */
function compact(obj) {
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/**
 * Normalise a raw Pixiv token response (or a cached/gppt token) into `TokenInfo`.
 *
 * @param {object} raw
 * @param {Object} [options]
 * @param {string} [options.provider]
 * @param {string} [options.method]
 * @param {Date} [options.obtainedAt]
 * @param {Record<string,string>} [options.webCookies]
 * @param {TokenInfo} [options.previous] previously stored token (used to preserve web_cookies)
 * @returns {TokenInfo}
 */
function normalizeTokenInfo(raw, options = {}) {
  const source = raw || {};
  const obtainedAt = options.obtainedAt || new Date();

  const accessToken = source.access_token;
  if (typeof accessToken !== 'string' || accessToken === '') {
    throw new TypeError('Token response is missing a non-empty "access_token"');
  }

  const expiresIn = toFiniteNumber(source.expires_in);
  const expiresAt = source.expires_at || computeExpiresAt(expiresIn, obtainedAt);

  // Refresh-token rotation: prefer the freshly issued one, but never clobber an
  // existing refresh token with an empty value (a real gppt v5 footgun).
  const refreshToken =
    typeof source.refresh_token === 'string' && source.refresh_token !== ''
      ? source.refresh_token
      : (options.previous && options.previous.refresh_token) || '';

  const webCookies =
    options.webCookies !== undefined
      ? options.webCookies
      : source.web_cookies !== undefined
        ? source.web_cookies
        : options.previous && options.previous.web_cookies;

  const user = normalizeUser(source.user, source);

  return compact({
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: expiresIn,
    expires_at: expiresAt,
    obtained_at: obtainedAt.toISOString(),
    token_type: source.token_type || 'bearer',
    scope: source.scope || '',
    user,
    web_cookies:
      webCookies && Object.keys(webCookies).length > 0 ? { ...webCookies } : undefined,
    provider: options.provider,
    method: options.method,
    last_refreshed_at: source.last_refreshed_at,
  });
}

/**
 * Accept both `user: {...}` and gppt's flattened `user_id` / `user_name` fields.
 * @param {TokenUser|undefined} user
 * @param {object} source
 * @returns {TokenUser|undefined}
 */
function normalizeUser(user, source) {
  if (user && typeof user === 'object') return user;
  if (!source) return undefined;
  const id = source.user_id;
  const name = source.user_name;
  const account = source.user_account;
  if (id === undefined && name === undefined && account === undefined) return undefined;
  return compact({
    id: id === undefined ? undefined : String(id),
    name: name === undefined ? undefined : String(name),
    account: account === undefined ? undefined : String(account),
  });
}

/**
 * @param {unknown} value
 * @returns {number}
 */
function toFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Minimal structural validation for a token loaded from disk.
 * @param {unknown} value
 * @returns {boolean}
 */
function isTokenInfoShape(value) {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (/** @type {any} */ (value).access_token) === 'string' &&
    /** @type {any} */ (value).access_token !== ''
  );
}

module.exports = {
  TOKEN_EXPIRY_SKEW_MS,
  parseAbsoluteDate,
  computeExpiresAt,
  isTokenExpired,
  msUntilExpiry,
  normalizeTokenInfo,
  isTokenInfoShape,
};
