const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isTokenExpired,
  msUntilExpiry,
  normalizeTokenInfo,
  computeExpiresAt,
  parseAbsoluteDate,
  TOKEN_EXPIRY_SKEW_MS,
} = require('../lib/auth/token/token-info');

/**
 * @param {object} overrides
 * @returns {object}
 */
function token(overrides = {}) {
  return { access_token: 'a', refresh_token: 'r', expires_in: 3600, ...overrides };
}

test('default expiry skew is the documented 5 minutes', () => {
  assert.equal(TOKEN_EXPIRY_SKEW_MS, 300000);
});

test('a token with plenty of life left is valid', () => {
  const fresh = token({ expires_at: new Date(Date.now() + 3600_000).toISOString() });
  assert.equal(isTokenExpired(fresh), false);
});

test('an already-expired token is expired', () => {
  const stale = token({ expires_at: new Date(Date.now() - 1000).toISOString() });
  assert.equal(isTokenExpired(stale), true);
});

test('a token inside the expiry skew window is treated as expired', () => {
  // Expires in 60s.
  const soon = token({ expires_at: new Date(Date.now() + 60_000).toISOString() });
  assert.equal(isTokenExpired(soon), true, 'default 5-minute skew covers it');
  assert.equal(isTokenExpired(soon, 120_000), true, 'a wider skew also covers it');
  assert.equal(isTokenExpired(soon, 0), false, 'with no skew it is still valid');
});

test('expires_in + obtained_at is used when expires_at is absent', () => {
  const valid = token({ obtained_at: new Date(Date.now() - 1000).toISOString(), expires_in: 3600 });
  assert.equal(isTokenExpired(valid), false);

  const stale = token({ obtained_at: new Date(Date.now() - 7200_000).toISOString(), expires_in: 3600 });
  assert.equal(isTokenExpired(stale), true);
});

test('timezone-less expires_at is treated as expired instead of throwing', () => {
  const naive = token({ expires_at: '2099-01-01T00:00:00' });
  assert.equal(parseAbsoluteDate('2099-01-01T00:00:00'), null);
  assert.equal(isTokenExpired(naive), true);
});

test('a token missing expiry information is treated as expired (conservative)', () => {
  assert.equal(isTokenExpired(token({ expires_at: undefined, expires_in: 0 })), true);
  assert.equal(isTokenExpired(null), true);
  assert.equal(isTokenExpired({}), true);
});

test('msUntilExpiry reports remaining lifetime', () => {
  const t = token({ expires_at: new Date(Date.now() + 120_000).toISOString() });
  const remaining = msUntilExpiry(t);
  assert.ok(remaining > 100_000 && remaining <= 120_000, `got ${remaining}`);
  assert.equal(msUntilExpiry({ access_token: 'a' }), null);
});

test('computeExpiresAt produces an absolute, timezone-aware timestamp', () => {
  const obtainedAt = new Date('2024-01-01T00:00:00.000Z');
  assert.equal(computeExpiresAt(60, obtainedAt), '2024-01-01T00:01:00.000Z');
  assert.equal(computeExpiresAt(0, obtainedAt), undefined);
  assert.equal(computeExpiresAt(-5, obtainedAt), undefined);
  assert.equal(computeExpiresAt('nonsense', obtainedAt), undefined);
});

test('normalizeTokenInfo produces the documented shape', () => {
  const obtainedAt = new Date('2024-01-01T00:00:00.000Z');
  const normalized = normalizeTokenInfo(
    {
      access_token: 'a',
      refresh_token: 'r',
      expires_in: 3600,
      token_type: 'bearer',
      scope: 'read',
      user: { id: '1', name: 'n', account: 'ac' },
    },
    { provider: 'native', method: 'oauth', obtainedAt }
  );

  assert.deepEqual(normalized, {
    access_token: 'a',
    refresh_token: 'r',
    expires_in: 3600,
    expires_at: '2024-01-01T01:00:00.000Z',
    obtained_at: '2024-01-01T00:00:00.000Z',
    token_type: 'bearer',
    scope: 'read',
    user: { id: '1', name: 'n', account: 'ac' },
    provider: 'native',
    method: 'oauth',
  });
});

test('normalizeTokenInfo accepts gppt flattened user fields', () => {
  const normalized = normalizeTokenInfo({
    access_token: 'a',
    refresh_token: 'r',
    expires_in: 3600,
    user_id: '99',
    user_name: 'flat',
    user_account: 'flat_acc',
  });
  assert.deepEqual(normalized.user, { id: '99', name: 'flat', account: 'flat_acc' });
});

test('normalizeTokenInfo rejects a token without access_token', () => {
  assert.throws(() => normalizeTokenInfo({ refresh_token: 'r' }), TypeError);
});

test('normalizeTokenInfo never emits undefined fields into JSON', () => {
  const normalized = normalizeTokenInfo({ access_token: 'a', refresh_token: '' });
  const keys = Object.keys(JSON.parse(JSON.stringify(normalized)));
  for (const key of keys) {
    assert.notEqual(normalized[key], undefined, `${key} should have been dropped`);
  }
});
