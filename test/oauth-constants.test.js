const test = require('node:test');
const assert = require('node:assert/strict');

const constants = require('../lib/auth/oauth/constants');

/**
 * These assertions lock the wire contract with Pixiv. When Pixiv changes a
 * parameter, this test is the single place that must be updated — the rest of
 * the codebase reads everything from `constants`.
 */
test('Pixiv OAuth endpoints and client identity are centralised', () => {
  assert.equal(constants.TOKEN_URL, 'https://oauth.secure.pixiv.net/auth/token');
  assert.equal(constants.LOGIN_URL, 'https://app-api.pixiv.net/web/v1/login');
  assert.equal(
    constants.REDIRECT_URI,
    'https://app-api.pixiv.net/web/v1/users/auth/pixiv/callback'
  );
  assert.equal(constants.CALLBACK_HOST, 'app-api.pixiv.net');
  assert.equal(constants.CLIENT_ID, 'MOBrBDS8blbauoSck0ZfDbtuzpyT');
  assert.ok(constants.CLIENT_SECRET.length > 0);
  assert.equal(constants.APP_OS, 'ios');
  assert.equal(constants.APP_OS_VERSION, '14.6');
  assert.match(constants.USER_AGENT, /^PixivIOSApp\/7\.13\.3/);
});

test('token endpoint headers match what Pixiv expects', () => {
  assert.deepEqual(constants.TOKEN_HEADERS, {
    'user-agent': constants.USER_AGENT,
    'app-os-version': constants.APP_OS_VERSION,
    'app-os': constants.APP_OS,
    'content-type': 'application/x-www-form-urlencoded',
  });
});

test('the callback host is inside the redirect URI', () => {
  assert.ok(new URL(constants.REDIRECT_URI).hostname === constants.CALLBACK_HOST);
  assert.ok(constants.TOKEN_REQUEST_TIMEOUT_MS > 0);
});
