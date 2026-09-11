/**
 * Pixiv OAuth protocol constants.
 *
 * Centralised so that a Pixiv-side parameter change is a one-file edit
 * (see test/oauth-constants.test.js which locks the wire contract).
 */

/** Pixiv App API client used by the official mobile app. */
const CLIENT_ID = 'MOBrBDS8blbauoSck0ZfDbtuzpyT';
const CLIENT_SECRET = 'lsACyCD94FhDUtGTXi3QzcFE2uU1hqtDaKeqrdwj';

/** Official iOS app fingerprint; the token endpoint expects an app UA. */
const USER_AGENT = 'PixivIOSApp/7.13.3 (iOS 14.6; iPhone13,2)';
const APP_OS = 'ios';
const APP_OS_VERSION = '14.6';

/** A desktop-browser UA is used for the login page (not the token endpoint). */
const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const TOKEN_URL = 'https://oauth.secure.pixiv.net/auth/token';
const LOGIN_URL = 'https://app-api.pixiv.net/web/v1/login';
const REDIRECT_URI = 'https://app-api.pixiv.net/web/v1/users/auth/pixiv/callback';

/** Host the OAuth callback must land on for a code to be considered valid. */
const CALLBACK_HOST = 'app-api.pixiv.net';

/** Network timeout for token endpoint calls (ms). */
const TOKEN_REQUEST_TIMEOUT_MS = 30000;

/** Headers sent to the token endpoint for both code exchange and refresh. */
const TOKEN_HEADERS = {
  'user-agent': USER_AGENT,
  'app-os-version': APP_OS_VERSION,
  'app-os': APP_OS,
  'content-type': 'application/x-www-form-urlencoded',
};

module.exports = {
  CLIENT_ID,
  CLIENT_SECRET,
  USER_AGENT,
  APP_OS,
  APP_OS_VERSION,
  BROWSER_USER_AGENT,
  TOKEN_URL,
  LOGIN_URL,
  REDIRECT_URI,
  CALLBACK_HOST,
  TOKEN_REQUEST_TIMEOUT_MS,
  TOKEN_HEADERS,
};
