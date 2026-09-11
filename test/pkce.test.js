const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const {
  generateCodeVerifier,
  generateCodeChallenge,
  buildLoginUrl,
  extractOAuthParam,
  parseCallbackUrl,
} = require('../lib/auth/oauth/pkce');

test('code verifier length and charset are RFC 7636 compliant', () => {
  for (let i = 0; i < 25; i += 1) {
    const verifier = generateCodeVerifier();
    assert.ok(verifier.length >= 43 && verifier.length <= 128, `bad length ${verifier.length}`);
    assert.match(verifier, /^[A-Za-z0-9_-]+$/);
  }
});

test('code verifiers are unique', () => {
  const seen = new Set();
  for (let i = 0; i < 100; i += 1) seen.add(generateCodeVerifier());
  assert.equal(seen.size, 100);
});

test('code challenge is deterministic S256 base64url without padding', () => {
  const verifier = 'fixed-verifier-value';
  const first = generateCodeChallenge(verifier);
  const second = generateCodeChallenge(verifier);
  assert.equal(first, second);

  const expected = crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  assert.equal(first, expected);
  assert.ok(!first.includes('='));
  assert.ok(!first.includes('+'));
  assert.ok(!first.includes('/'));
});

test('login URL carries PKCE parameters', () => {
  const url = new URL(buildLoginUrl('CHALLENGE'));
  assert.equal(url.hostname, 'app-api.pixiv.net');
  assert.equal(url.searchParams.get('code_challenge'), 'CHALLENGE');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('client'), 'pixiv-android');
});

test('extractOAuthParam only accepts the Pixiv callback host', () => {
  const good = 'https://app-api.pixiv.net/web/v1/users/auth/pixiv/callback?code=ABC';
  assert.equal(extractOAuthParam(good, 'code'), 'ABC');

  const evil = 'https://evil.example.com/?code=ABC';
  assert.equal(extractOAuthParam(evil, 'code'), null);

  const subdomain = 'https://app-api.pixiv.net.evil.com/?code=ABC';
  assert.equal(extractOAuthParam(subdomain, 'code'), null);
});

test('extractOAuthParam rejects unrelated, empty and malformed URLs', () => {
  assert.equal(extractOAuthParam('https://app-api.pixiv.net/other', 'code'), null);
  assert.equal(extractOAuthParam('https://app-api.pixiv.net/?code=', 'code'), null);
  assert.equal(extractOAuthParam('not a url', 'code'), null);
  assert.equal(extractOAuthParam('', 'code'), null);
  assert.equal(extractOAuthParam(null, 'code'), null);
});

test('parseCallbackUrl surfaces error callbacks and ignores non-terminal URLs', () => {
  assert.deepEqual(
    parseCallbackUrl('https://app-api.pixiv.net/cb?error=access_denied'),
    { code: null, error: 'access_denied' }
  );
  assert.deepEqual(parseCallbackUrl('https://app-api.pixiv.net/cb?code=XYZ'), {
    code: 'XYZ',
    error: null,
  });
  assert.equal(parseCallbackUrl('https://app-api.pixiv.net/login'), null);
  assert.equal(parseCallbackUrl('https://app-api.pixiv.net/cb'), null);

  // An error must win over a code if both are present.
  const both = parseCallbackUrl('https://app-api.pixiv.net/cb?code=XYZ&error=denied');
  assert.deepEqual(both, { code: null, error: 'denied' });
});
