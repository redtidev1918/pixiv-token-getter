const test = require('node:test');
const assert = require('node:assert/strict');

const {
  exchangeCodeForToken,
  refreshAccessToken,
  describeErrorBody,
} = require('../lib/auth/oauth/token-exchange');
const { CLIENT_ID, TOKEN_URL } = require('../lib/auth/oauth/constants');
const { TokenExchangeError, RefreshError } = require('../lib/errors');
const { okTransport, failingTransport, rawTokenResponse } = require('./helpers');

test('code exchange sends the PKCE authorization_code grant', async () => {
  const transport = okTransport();
  const token = await exchangeCodeForToken('CODE', 'VERIFIER', { transport });

  const sent = transport.calls[0];
  assert.equal(sent.url, TOKEN_URL);
  assert.equal(sent.form.grant_type, 'authorization_code');
  assert.equal(sent.form.code, 'CODE');
  assert.equal(sent.form.code_verifier, 'VERIFIER');
  assert.equal(sent.form.client_id, CLIENT_ID);
  assert.equal(token.access_token, 'access-AAA');
  assert.equal(token.refresh_token, 'refresh-RRR');
  assert.ok(token.expires_at);
  assert.ok(token.obtained_at);
});

test('code exchange rejects a response without refresh_token', async () => {
  const transport = okTransport(rawTokenResponse({ refresh_token: undefined }));
  await assert.rejects(
    () => exchangeCodeForToken('CODE', 'VERIFIER', { transport }),
    (error) => error instanceof TokenExchangeError && /refresh_token/.test(error.message)
  );
});

test('code exchange rejects a response without access_token', async () => {
  const transport = okTransport({ refresh_token: 'r' });
  await assert.rejects(
    () => exchangeCodeForToken('CODE', 'VERIFIER', { transport }),
    (error) => error instanceof TokenExchangeError && /access_token/.test(error.message)
  );
});

test('HTTP failure surfaces as TokenExchangeError without leaking the body', async () => {
  const transport = failingTransport(400, { error: 'invalid_grant', refresh_token: 'secret-token' });
  await assert.rejects(
    () => exchangeCodeForToken('CODE', 'VERIFIER', { transport }),
    (error) => {
      assert.ok(error instanceof TokenExchangeError);
      assert.match(error.message, /HTTP 400/);
      assert.match(error.message, /invalid_grant/);
      assert.ok(!error.message.includes('secret-token'), 'must not leak token values');
      return true;
    }
  );
});

test('refresh uses grant_type=refresh_token and returns a usable token', async () => {
  const transport = okTransport();
  const token = await refreshAccessToken('OLD-REFRESH', { transport });
  assert.equal(transport.calls[0].form.grant_type, 'refresh_token');
  assert.equal(transport.calls[0].form.refresh_token, 'OLD-REFRESH');
  assert.equal(token.refresh_token, 'refresh-RRR');
});

test('refresh-token rotation: a newly issued refresh token wins', async () => {
  const transport = okTransport(rawTokenResponse({ refresh_token: 'NEW-REFRESH' }));
  const token = await refreshAccessToken('OLD-REFRESH', {
    transport,
    previous: { access_token: 'x', refresh_token: 'OLD-REFRESH' },
  });
  assert.equal(token.refresh_token, 'NEW-REFRESH');
});

test('refresh never clobbers an existing refresh token with an empty value', async () => {
  const transport = okTransport(rawTokenResponse({ refresh_token: '' }));
  const token = await refreshAccessToken('OLD-REFRESH', {
    transport,
    previous: { access_token: 'x', refresh_token: 'OLD-REFRESH' },
  });
  assert.equal(token.refresh_token, 'OLD-REFRESH');
});

test('refresh preserves existing web cookies (refresh returns none)', async () => {
  const transport = okTransport();
  const token = await refreshAccessToken('OLD-REFRESH', {
    transport,
    previous: {
      access_token: 'x',
      refresh_token: 'OLD-REFRESH',
      web_cookies: { PHPSESSID: 'session-1' },
    },
  });
  assert.deepEqual(token.web_cookies, { PHPSESSID: 'session-1' });
});

test('refresh without a refresh token fails fast', async () => {
  await assert.rejects(() => refreshAccessToken('', {}), RefreshError);
  await assert.rejects(() => refreshAccessToken(undefined, {}), RefreshError);
});

test('transient HTTP failure on refresh surfaces as RefreshError', async () => {
  const transport = failingTransport(503, { error: 'server_error' });
  await assert.rejects(
    () => refreshAccessToken('OLD-REFRESH', { transport }),
    (error) => error instanceof RefreshError && /HTTP 503/.test(error.message)
  );
});

test('describeErrorBody redacts token-like fields', () => {
  const text = describeErrorBody({ error: 'x', access_token: 'aaa', refresh_token: 'bbb' });
  assert.ok(!text.includes('aaa'));
  assert.ok(!text.includes('bbb'));
});
