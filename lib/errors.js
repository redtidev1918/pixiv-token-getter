/**
 * Stable error model for pixiv-token-getter.
 *
 * Consumers (PixivFlow, other Node apps) should branch on `error.code`
 * (or `instanceof`) instead of parsing error strings.
 */

/** Stable machine-readable error codes. */
const ErrorCode = {
  AUTH_ERROR: 'AUTH_ERROR',
  LOGIN_ERROR: 'LOGIN_ERROR',
  TOKEN_EXCHANGE_ERROR: 'TOKEN_EXCHANGE_ERROR',
  REFRESH_ERROR: 'REFRESH_ERROR',
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  PROFILE_ERROR: 'PROFILE_ERROR',
  TOKEN_STORE_ERROR: 'TOKEN_STORE_ERROR',
  TWO_FACTOR_REQUIRED: 'TWO_FACTOR_REQUIRED',
  INVALID_CALLBACK: 'INVALID_CALLBACK',
};

/**
 * Base class for all authentication errors raised by this package.
 */
class AuthError extends Error {
  /**
   * @param {string} message
   * @param {{ code?: string, provider?: string, cause?: unknown, details?: object }} [options]
   */
  constructor(message, options = {}) {
    super(message);
    this.name = new.target.name;
    this.code = options.code || ErrorCode.AUTH_ERROR;
    if (options.provider) this.provider = options.provider;
    if (options.details) this.details = options.details;
    if (options.cause !== undefined) this.cause = options.cause;
  }
}

/** Failure while driving a login flow (browser cancelled, selector missing, ...). */
class LoginError extends AuthError {
  constructor(message, options = {}) {
    super(message, { code: ErrorCode.LOGIN_ERROR, ...options });
  }
}

/** Failure while exchanging an authorization code for a token. */
class TokenExchangeError extends AuthError {
  constructor(message, options = {}) {
    super(message, { code: ErrorCode.TOKEN_EXCHANGE_ERROR, ...options });
  }
}

/** Failure while refreshing an access token with a refresh token. */
class RefreshError extends AuthError {
  constructor(message, options = {}) {
    super(message, { code: ErrorCode.REFRESH_ERROR, ...options });
  }
}

/** A provider was requested but is not usable in this environment. */
class ProviderUnavailableError extends AuthError {
  constructor(message, options = {}) {
    super(message, { code: ErrorCode.PROVIDER_UNAVAILABLE, ...options });
  }
}

/** Invalid or missing profile (name, file, JSON). */
class ProfileError extends AuthError {
  constructor(message, options = {}) {
    super(message, { code: ErrorCode.PROFILE_ERROR, ...options });
  }
}

/** Token persistence failed. The previous token MUST remain intact. */
class TokenStoreError extends AuthError {
  constructor(message, options = {}) {
    super(message, { code: ErrorCode.TOKEN_STORE_ERROR, ...options });
  }
}

/** Pixiv asked for a second factor and no TOTP code/provider was supplied. */
class TwoFactorRequiredError extends AuthError {
  constructor(message, options = {}) {
    super(message, { code: ErrorCode.TWO_FACTOR_REQUIRED, ...options });
  }
}

/**
 * Detect whether an error is one of ours.
 * @param {unknown} error
 * @returns {boolean}
 */
function isAuthError(error) {
  return error instanceof AuthError;
}

module.exports = {
  ErrorCode,
  AuthError,
  LoginError,
  TokenExchangeError,
  RefreshError,
  ProviderUnavailableError,
  ProfileError,
  TokenStoreError,
  TwoFactorRequiredError,
  isAuthError,
};
