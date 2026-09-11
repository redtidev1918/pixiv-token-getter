const test = require('node:test');
const assert = require('node:assert/strict');

const lifecycle = require('../lib/auth/token/lifecycle');
const providers = require('../lib/auth/providers');
const { MemoryTokenStore } = require('../lib/auth/token/store');
const { RefreshError } = require('../lib/errors');
const { okTransport, failingTransport, rawTokenResponse, useTempConfigDir } = require('./helpers');

/**
 * Install a fake login provider for the duration of a test.
 * @param {any} fakeProvider
 * @param {() => Promise<void>} fn
 */
async function withFakeProvider(fakeProvider, fn) {
  const saved = providers.PROVIDERS.fake;
  providers.PROVIDERS.fake = fakeProvider;
  try {
    await fn();
  } finally {
    if (saved === undefined) delete providers.PROVIDERS.fake;
    else providers.PROVIDERS.fake = saved;
  }
}

/**
 * @param {Partial<import('../lib/auth/token/token-info').TokenInfo>} [overrides]
 * @returns {import('../lib/auth/token/token-info').TokenInfo}
 */
function storedToken(overrides = {}) {
  return {
    access_token: 'cached-access',
    refresh_token: 'cached-refresh',
    expires_in: 3600,
    expires_at: new Date(Date.now() + 3600_000).toISOString(),
    obtained_at: new Date().toISOString(),
    token_type: 'bearer',
    scope: '',
    provider: 'fake',
    ...overrides,
  };
}

test('a valid cached token is returned without any provider activity', async (t) => {
  const temp = useTempConfigDir();
  t.after(temp.cleanup);

  const store = new MemoryTokenStore();
  await store.save('default', storedToken());

  let providerCalls = 0;
  await withFakeProvider(
    {
      id: 'fake',
      methods: ['oauth'],
      async login() {
        providerCalls += 1;
        return storedToken({ access_token: 'fresh' });
      },
    },
    async () => {
      const result = await lifecycle.resolveToken({ profile: 'default', store, provider: 'fake' });
      assert.equal(result.source, 'cache');
      assert.equal(result.token.access_token, 'cached-access');
    }
  );

  assert.equal(providerCalls, 0);
});

test('an expired cached token triggers a refresh and is persisted', async (t) => {
  const temp = useTempConfigDir();
  t.after(temp.cleanup);

  const store = new MemoryTokenStore();
  await store.save(
    'default',
    storedToken({ expires_at: new Date(Date.now() - 1000).toISOString() })
  );

  const transport = okTransport(rawTokenResponse({ access_token: 'refreshed', refresh_token: 'r2' }));
  const result = await lifecycle.resolveToken({
    profile: 'default',
    store,
    provider: 'fake',
    transport,
  });

  assert.equal(result.source, 'refresh');
  assert.equal(result.token.access_token, 'refreshed');

  const persisted = await store.load('default');
  assert.equal(persisted.access_token, 'refreshed');
  assert.equal(persisted.refresh_token, 'r2');
  assert.ok(persisted.last_refreshed_at, 'refresh timestamp is recorded');
});

test('refresh-token rotation is persisted (new refresh token is stored)', async (t) => {
  const temp = useTempConfigDir();
  t.after(temp.cleanup);

  const store = new MemoryTokenStore();
  await store.save(
    'default',
    storedToken({ refresh_token: 'OLD-ROTATE', expires_at: new Date(0).toISOString() })
  );

  const transport = okTransport(rawTokenResponse({ refresh_token: 'NEW-ROTATE' }));
  await lifecycle.getToken({ profile: 'default', store, provider: 'fake', transport });

  assert.equal((await store.load('default')).refresh_token, 'NEW-ROTATE');
});

test('refresh failures fall through to a login and never destroy the old token', async (t) => {
  const temp = useTempConfigDir();
  t.after(temp.cleanup);

  const store = new MemoryTokenStore();
  await store.save(
    'default',
    storedToken({ refresh_token: 'STALE', expires_at: new Date(0).toISOString() })
  );

  const events = [];
  await withFakeProvider(
    {
      id: 'fake',
      methods: ['oauth'],
      async login() {
        return storedToken({ access_token: 'logged-in', refresh_token: 'brand-new' });
      },
    },
    async () => {
      const result = await lifecycle.resolveToken({
        profile: 'default',
        store,
        provider: 'fake',
        transport: failingTransport(400, { error: 'invalid_grant' }),
        onEvent: (event) => events.push(event.type),
      });
      assert.equal(result.source, 'login');
      assert.equal(result.token.access_token, 'logged-in');
    }
  );

  assert.deepEqual(events, ['cache_stale', 'refresh_failed', 'logged_in']);
  assert.equal((await store.load('default')).refresh_token, 'brand-new');
});

test('refreshOnly fails visibly instead of spawning a login (server runtime)', async (t) => {
  const temp = useTempConfigDir();
  t.after(temp.cleanup);

  const store = new MemoryTokenStore();
  let providerCalls = 0;

  await withFakeProvider(
    {
      id: 'fake',
      methods: ['oauth'],
      async login() {
        providerCalls += 1;
        return storedToken();
      },
    },
    async () => {
      await assert.rejects(
        () =>
          lifecycle.resolveToken({
            profile: 'default',
            store,
            provider: 'fake',
            refreshOnly: true,
            transport: failingTransport(400),
          }),
        (error) => error.code === 'TOKEN_EXCHANGE_ERROR' || error.code === 'REFRESH_ERROR'
      );
    }
  );

  assert.equal(providerCalls, 0, 'a headless runtime must never attempt an interactive login');
});

test('refreshOnly without a stored token gives an actionable error', async (t) => {
  const temp = useTempConfigDir();
  t.after(temp.cleanup);

  await assert.rejects(
    () => lifecycle.refreshStoredToken({ profile: 'default', store: new MemoryTokenStore() }),
    (error) => error instanceof RefreshError && /ptg login/.test(error.message)
  );
});

test('force=true skips cache and refresh', async (t) => {
  const temp = useTempConfigDir();
  t.after(temp.cleanup);

  const store = new MemoryTokenStore();
  await store.save('default', storedToken());

  let providerCalls = 0;
  await withFakeProvider(
    {
      id: 'fake',
      methods: ['oauth'],
      async login() {
        providerCalls += 1;
        return storedToken({ access_token: 'forced' });
      },
    },
    async () => {
      const result = await lifecycle.resolveToken({
        profile: 'default',
        store,
        provider: 'fake',
        force: true,
      });
      assert.equal(result.source, 'login');
      assert.equal(result.token.access_token, 'forced');
    }
  );

  assert.equal(providerCalls, 1);
});

test('web cookies survive a refresh (refresh responses carry none)', async (t) => {
  const temp = useTempConfigDir();
  t.after(temp.cleanup);

  const store = new MemoryTokenStore();
  await store.save(
    'default',
    storedToken({
      web_cookies: { PHPSESSID: 'session-xyz' },
      expires_at: new Date(0).toISOString(),
    })
  );

  const token = await lifecycle.getToken({
    profile: 'default',
    store,
    provider: 'fake',
    transport: okTransport(),
  });

  assert.deepEqual(token.web_cookies, { PHPSESSID: 'session-xyz' });
});

test('logout removes the credential and purge also clears the browser profile', async (t) => {
  const temp = useTempConfigDir();
  t.after(temp.cleanup);

  const store = new MemoryTokenStore();
  await store.save('default', storedToken());

  const result = await lifecycle.logout({ profile: 'default', store, purge: true });
  assert.equal(result.tokenRemoved, true);
  assert.equal(result.profileRemoved, true);
  assert.equal(await store.load('default'), null);
});

test('status never includes secret values', async (t) => {
  const temp = useTempConfigDir();
  t.after(temp.cleanup);

  const store = new MemoryTokenStore();
  await store.save('default', storedToken({ access_token: 'SUPER-SECRET-ACCESS' }));

  const info = await lifecycle.status({ profile: 'default', store });
  const serialised = JSON.stringify(info);
  assert.ok(info.hasToken);
  assert.equal(info.accessToken.valid, true);
  assert.equal(info.refreshToken.present, true);
  assert.ok(!serialised.includes('SUPER-SECRET-ACCESS'), 'status must not leak the access token');
  assert.ok(!serialised.includes('cached-refresh'), 'status must not leak the refresh token');
  assert.equal(info.user, null);
});

test('status for an unknown profile reports "no credential"', async (t) => {
  const temp = useTempConfigDir();
  t.after(temp.cleanup);

  const info = await lifecycle.status({ profile: 'nobody', store: new MemoryTokenStore() });
  assert.equal(info.hasToken, false);
  assert.equal(info.accessToken.present, false);
});

test('a token inside the skew window is refreshed rather than reused', async (t) => {
  const temp = useTempConfigDir();
  t.after(temp.cleanup);

  const store = new MemoryTokenStore();
  await store.save(
    'default',
    storedToken({ expires_at: new Date(Date.now() + 60_000).toISOString() })
  );

  const result = await lifecycle.resolveToken({
    profile: 'default',
    store,
    provider: 'fake',
    transport: okTransport(rawTokenResponse({ access_token: 'refreshed-early' })),
  });

  assert.equal(result.source, 'refresh');
  assert.equal(result.token.access_token, 'refreshed-early');
});
