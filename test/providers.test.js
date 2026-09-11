const test = require('node:test');
const assert = require('node:assert/strict');

const providers = require('../lib/auth/providers');
const { ProviderUnavailableError, LoginError } = require('../lib/errors');

/**
 * Swap real providers for fakes for the duration of a test.
 * @param {Record<string, any>} replacements
 * @param {() => Promise<void>} fn
 */
async function withProviders(replacements, fn) {
  const saved = {};
  for (const [key, value] of Object.entries(replacements)) {
    saved[key] = providers.PROVIDERS[key];
    providers.PROVIDERS[key] = value;
  }
  try {
    await fn();
  } finally {
    for (const key of Object.keys(replacements)) {
      if (saved[key] === undefined) delete providers.PROVIDERS[key];
      else providers.PROVIDERS[key] = saved[key];
    }
  }
}

test('provider ids are stable', () => {
  assert.equal(providers.native.id, 'native');
  assert.equal(providers.gppt.id, 'gppt');
  assert.deepEqual(providers.native.methods, ['oauth', 'browser', 'e2e']);
  assert.deepEqual(providers.gppt.methods, ['import', 'e2e']);
});

test('an unknown provider id is rejected', () => {
  assert.throws(() => providers.getProvider('python'), ProviderUnavailableError);
});

test('selection resolves a single provider by default', () => {
  assert.deepEqual(providers.providerPlan('native').map((p) => p.id), ['native']);
  assert.deepEqual(providers.providerPlan('gppt').map((p) => p.id), ['gppt']);
  assert.deepEqual(providers.providerPlan().map((p) => p.id), ['native']);
});

test('only "auto" enables an ordered, explicit fallback list', () => {
  assert.deepEqual(providers.providerPlan('auto').map((p) => p.id), ['native', 'gppt']);
});

test('native does NOT fall back when it fails (no implicit provider storm)', async () => {
  let nativeAttempts = 0;
  let gpptAttempts = 0;

  await withProviders(
    {
      native: {
        id: 'native',
        methods: ['oauth'],
        async login() {
          nativeAttempts += 1;
          throw new LoginError('native failed');
        },
      },
      gppt: {
        id: 'gppt',
        methods: ['import'],
        async login() {
          gpptAttempts += 1;
          return { access_token: 'x', refresh_token: 'y' };
        },
      },
    },
    async () => {
      await assert.rejects(
        () => providers.loginWithFallback({ provider: 'native' }),
        LoginError
      );
    }
  );

  assert.equal(nativeAttempts, 1);
  assert.equal(gpptAttempts, 0, 'gppt must never be tried implicitly');
});

test('auto tries each provider at most once and stops on a definitive auth failure', async () => {
  const attempts = [];

  await withProviders(
    {
      native: {
        id: 'native',
        methods: ['oauth'],
        async login() {
          attempts.push('native');
          throw new LoginError('bad credentials');
        },
      },
      gppt: {
        id: 'gppt',
        methods: ['import'],
        async login() {
          attempts.push('gppt');
          return { access_token: 'x', refresh_token: 'y' };
        },
      },
    },
    async () => {
      await assert.rejects(() => providers.loginWithFallback({ provider: 'auto' }), LoginError);
    }
  );

  // native failed with a definitive LOGIN_ERROR → do not storm gppt.
  assert.deepEqual(attempts, ['native']);
});

test('auto moves on when a provider is merely unavailable', async () => {
  const attempts = [];

  await withProviders(
    {
      native: {
        id: 'native',
        methods: ['oauth'],
        async login() {
          attempts.push('native');
          throw new ProviderUnavailableError('puppeteer missing');
        },
      },
      gppt: {
        id: 'gppt',
        methods: ['import'],
        async login() {
          attempts.push('gppt');
          return { access_token: 'from-gppt', refresh_token: 'y' };
        },
      },
    },
    async () => {
      const result = await providers.loginWithFallback({ provider: 'auto' });
      assert.equal(result.token.access_token, 'from-gppt');
      assert.equal(result.providerId, 'gppt');
    }
  );

  assert.deepEqual(attempts, ['native', 'gppt']);
});

test('loginWithFallback reports which providers were attempted', async () => {
  await withProviders(
    {
      native: {
        id: 'native',
        methods: ['oauth'],
        async login() {
          return { access_token: 'a', refresh_token: 'r' };
        },
      },
    },
    async () => {
      const result = await providers.loginWithFallback({ provider: 'native' });
      assert.equal(result.providerId, 'native');
      assert.deepEqual(result.attempts, ['native']);
      assert.equal(result.token.access_token, 'a');
    }
  );
});
