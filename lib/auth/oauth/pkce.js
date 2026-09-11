/**
 * PKCE (RFC 7636) helpers plus Pixiv login-URL / callback parsing.
 *
 * Pure functions only — no browser, no network — so everything here is
 * cheap to unit test.
 */

const crypto = require('crypto');

const { LOGIN_URL, CALLBACK_HOST } = require('./constants');

/**
 * Generate a PKCE code verifier.
 * 64 random bytes base64url-encoded → 86 chars, inside the RFC 7636 43..128 range.
 * @returns {string}
 */
function generateCodeVerifier() {
  return crypto.randomBytes(64).toString('base64url');
}

/**
 * Generate the S256 PKCE code challenge for a verifier.
 * @param {string} verifier
 * @returns {string} base64url(SHA256(verifier)) without padding
 */
function generateCodeChallenge(verifier) {
  return crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Build the Pixiv OAuth login URL with PKCE parameters.
 * @param {string} codeChallenge
 * @returns {string}
 */
function buildLoginUrl(codeChallenge) {
  const params = new URLSearchParams({
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    client: 'pixiv-android',
  });
  return `${LOGIN_URL}?${params.toString()}`;
}

/**
 * Extract an OAuth parameter from a URL, but only when the URL points at the
 * Pixiv callback host. This prevents false positives from unrelated requests
 * and from attacker-controlled redirects.
 *
 * @param {string} url
 * @param {'code'|'error'} param
 * @returns {string|null}
 */
function extractOAuthParam(url, param) {
  if (!url || typeof url !== 'string') return null;
  let urlObj;
  try {
    urlObj = new URL(url);
  } catch (error) {
    return null;
  }
  if (urlObj.hostname !== CALLBACK_HOST) return null;
  try {
    const value = urlObj.searchParams.get(param);
    return value === null || value === '' ? null : value;
  } catch (error) {
    return null;
  }
}

/**
 * Inspect a URL for a terminal OAuth outcome.
 * @param {string} url
 * @returns {{ code: string|null, error: string|null }|null} null when not a terminal URL
 */
function parseCallbackUrl(url) {
  const error = extractOAuthParam(url, 'error');
  if (error) return { code: null, error };
  const code = extractOAuthParam(url, 'code');
  if (code) return { code, error: null };
  return null;
}

module.exports = {
  generateCodeVerifier,
  generateCodeChallenge,
  buildLoginUrl,
  extractOAuthParam,
  parseCallbackUrl,
};
