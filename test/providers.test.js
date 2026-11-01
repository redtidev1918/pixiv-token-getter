const test = require('node:test');
const assert = require('node:assert/strict');
const providers = require('../lib/auth/providers');
const { ProviderUnavailableError, LoginError } = require('../lib/errors');

test('native is the only provider and removed provider ids are rejected', () => {
  assert.deepEqual(Object.keys(providers.PROVIDERS), ['native']);
  assert.deepEqual(providers.native.methods, ['oauth', 'browser', 'e2e']);
  assert.deepEqual(providers.providerPlan().map((p) => p.id), ['native']);
  for (const id of ['gppt', 'auto', 'python']) {
    assert.throws(() => providers.getProvider(id), ProviderUnavailableError);
  }
});

test('a failed native login is reported once', async () => {
  const original = providers.PROVIDERS.native;
  let attempts = 0;
  providers.PROVIDERS.native = {
    id: 'native', methods: ['oauth'],
    async login() { attempts++; throw new LoginError('failed'); },
  };
  try {
    await assert.rejects(() => providers.loginWithFallback({ provider: 'native' }), LoginError);
    assert.equal(attempts, 1);
  } finally {
    providers.PROVIDERS.native = original;
  }
});
