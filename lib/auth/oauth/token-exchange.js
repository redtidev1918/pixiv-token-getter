/**
 * Pixiv token endpoint: authorization-code exchange and refresh.
 *
 * Error messages here are deliberately sanitised — a token endpoint failure
 * must never leak a token into logs or into a thrown error.
 */

const {
  CLIENT_ID,
  CLIENT_SECRET,
  TOKEN_URL,
  REDIRECT_URI,
  TOKEN_HEADERS,
  TOKEN_REQUEST_TIMEOUT_MS,
} = require('./constants');
const { postForm } = require('../../http');
const { resolveProxy } = require('../proxy/proxy');
const { normalizeTokenInfo } = require('../token/token-info');
const { TokenExchangeError, RefreshError } = require('../../errors');

/**
 * Build a secret-free description of a token-endpoint error payload.
 * @param {any} body
 * @returns {string}
 */
function describeErrorBody(body) {
  if (!body) return '';
  if (typeof body === 'string') return truncate(redactSecrets(body), 200);

  const parts = [];
  for (const key of ['error', 'error_description', 'message', 'errors']) {
    if (body[key] !== undefined) {
      const value = typeof body[key] === 'string' ? body[key] : JSON.stringify(body[key]);
      parts.push(`${key}=${redactSecrets(value)}`);
    }
  }
  if (parts.length === 0) return truncate(redactSecrets(JSON.stringify(body)), 200);
  return truncate(parts.join(' '), 300);
}

/**
 * Mask anything that looks like a token.
 * @param {string} text
 * @returns {string}
 */
function redactSecrets(text) {
  return String(text).replace(
    /"(access_token|refresh_token|client_secret|code_verifier)"\s*:\s*"[^"]*"/g,
    '"$1":"***"'
  );
}

/**
 * @param {string} text
 * @param {number} max
 * @returns {string}
 */
function truncate(text, max) {
  const s = String(text);
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/**
 * Exchange an authorization code for a token pair.
 *
 * @param {string} code
 * @param {string} codeVerifier
 * @param {Object} [options]
 * @param {(req: any) => Promise<any>} [options.transport] injectable HTTP transport (tests)
 * @param {any} [options.proxy] explicit proxy config / false to disable
 * @param {string} [options.provider]
 * @param {string} [options.method]
 * @param {Date} [options.obtainedAt]
 * @returns {Promise<import('../token/token-info').TokenInfo>}
 */
async function exchangeCodeForToken(code, codeVerifier, options = {}) {
  const payload = await requestToken(
    {
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
      code_verifier: codeVerifier,
      grant_type: 'authorization_code',
      include_policy: 'true',
      redirect_uri: REDIRECT_URI,
    },
    options,
    TokenExchangeError
  );

  let token;
  try {
    token = normalizeTokenInfo(payload, {
      provider: options.provider,
      method: options.method,
      obtainedAt: options.obtainedAt,
    });
  } catch (error) {
    throw new TokenExchangeError(`Token response was not usable: ${error.message}`, {
      cause: error,
    });
  }

  // A code exchange is expected to yield a refresh token. Refresh itself is
  // exempt: there, an empty refresh_token legitimately means "keep the old one".
  if (options.requireRefreshToken !== false && !token.refresh_token) {
    throw new TokenExchangeError(
      'Token response contained no refresh_token; refusing to store an unrenewable credential'
    );
  }
  return token;
}

/**
 * Refresh an access token.
 *
 * Refresh-token rotation: Pixiv may return a NEW refresh token. We always use
 * it when present, and we never overwrite an existing refresh token with an
 * empty value (pass the current token as `previous` to enable that guarantee).
 *
 * @param {string} refreshToken
 * @param {Object} [options]
 * @param {(req: any) => Promise<any>} [options.transport]
 * @param {any} [options.proxy]
 * @param {import('../token/token-info').TokenInfo} [options.previous] currently stored token
 * @param {string} [options.provider]
 * @param {string} [options.method]
 * @param {Date} [options.obtainedAt]
 * @returns {Promise<import('../token/token-info').TokenInfo>}
 */
async function refreshAccessToken(refreshToken, options = {}) {
  if (!refreshToken || typeof refreshToken !== 'string') {
    throw new RefreshError('A refresh token is required to refresh');
  }

  const payload = await requestToken(
    {
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'refresh_token',
      include_policy: 'true',
      refresh_token: refreshToken,
    },
    options,
    RefreshError
  );

  try {
    return normalizeTokenInfo(payload, {
      provider: options.provider,
      method: options.method,
      obtainedAt: options.obtainedAt,
      previous: options.previous,
      // A refresh response carries no cookies: keep the ones we already have.
      webCookies: options.previous ? options.previous.web_cookies : undefined,
      last_refreshed_at: undefined,
    });
  } catch (error) {
    throw new RefreshError(`Refresh response was not usable: ${error.message}`, { cause: error });
  }
}

/**
 * Shared POST-to-token-endpoint helper.
 * @param {Record<string,string>} form
 * @param {Object} options
 * @param {new (message: string, opts?: object) => Error} ErrorClass
 * @returns {Promise<any>}
 */
async function requestToken(form, options, ErrorClass) {
  const proxy = resolveProxy(options.proxy);

  let response;
  try {
    response = await postForm(
      {
        url: TOKEN_URL,
        form,
        headers: { ...TOKEN_HEADERS },
        timeout: options.timeout || TOKEN_REQUEST_TIMEOUT_MS,
        proxy,
      },
      { transport: options.transport }
    );
  } catch (error) {
    const status = error && error.httpStatus ? ` HTTP ${error.httpStatus}.` : '';
    const detail = describeErrorBody(error && error.responseBody);
    // Keep the raw HTTP error only as `cause`; never as the message.
    throw new ErrorClass(`Token request failed.${status}${detail ? ` ${detail}` : ''}`, {
      cause: error,
      details: { httpStatus: error && error.httpStatus },
    });
  }

  const data = response && response.data;
  if (!data || typeof data !== 'object') {
    throw new ErrorClass('Token endpoint returned an empty or non-JSON body');
  }
  if (!data.access_token) {
    throw new ErrorClass(
      `Token endpoint returned no access_token.${describeErrorBody(data) ? ` ${describeErrorBody(data)}` : ''}`
    );
  }
  return data;
}

module.exports = {
  exchangeCodeForToken,
  refreshAccessToken,
  describeErrorBody,
};
