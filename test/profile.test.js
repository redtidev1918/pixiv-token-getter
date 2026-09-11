const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
  loadProfile,
  saveProfile,
  listProfiles,
  removeProfile,
  defaultProfile,
} = require('../lib/auth/profile/profile-store');
const { ProfileError } = require('../lib/errors');
const { useTempConfigDir } = require('./helpers');

test('a missing profile resolves to documented defaults', async (t) => {
  const temp = useTempConfigDir();
  t.after(temp.cleanup);

  const profile = await loadProfile('default');
  assert.equal(profile.name, 'default');
  assert.equal(profile.provider, 'native');
  assert.equal(profile.method, 'oauth');
  assert.equal(profile.userDataDir, null);
  assert.equal(profile.proxy, null);
});

test('profile patches are persisted and merged', async (t) => {
  const temp = useTempConfigDir();
  t.after(temp.cleanup);

  await saveProfile('main', { provider: 'gppt', method: 'import' });
  const second = await saveProfile('main', { proxy: 'http://127.0.0.1:8080' });

  assert.equal(second.provider, 'gppt');
  assert.equal(second.method, 'import');
  assert.equal(second.proxy, 'http://127.0.0.1:8080');

  const reloaded = await loadProfile('main');
  assert.deepEqual(
    { provider: reloaded.provider, method: reloaded.method, proxy: reloaded.proxy },
    { provider: 'gppt', method: 'import', proxy: 'http://127.0.0.1:8080' }
  );
});

test('multiple profiles stay independent', async (t) => {
  const temp = useTempConfigDir();
  t.after(temp.cleanup);

  await saveProfile('main', { provider: 'native' });
  await saveProfile('alt', { provider: 'gppt' });

  assert.deepEqual(await listProfiles(), ['alt', 'main']);
  assert.equal((await loadProfile('main')).provider, 'native');
  assert.equal((await loadProfile('alt')).provider, 'gppt');
});

test('unsupported provider / method values are rejected', async (t) => {
  const temp = useTempConfigDir();
  t.after(temp.cleanup);

  await assert.rejects(() => saveProfile('main', { provider: 'python' }), ProfileError);
  await assert.rejects(() => saveProfile('main', { method: 'telepathy' }), ProfileError);
});

test('profile names are validated (no path traversal)', async (t) => {
  const temp = useTempConfigDir();
  t.after(temp.cleanup);

  await assert.rejects(() => loadProfile('../evil'), ProfileError);
  await assert.rejects(() => saveProfile('a/b', {}), ProfileError);
  await assert.rejects(() => loadProfile(''), ProfileError);
});

test('malformed profile JSON fails loudly', async (t) => {
  const temp = useTempConfigDir();
  t.after(temp.cleanup);

  const file = path.join(temp.dir, 'profiles', 'broken.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '{ oops');

  await assert.rejects(() => loadProfile('broken'), ProfileError);
});

test('unknown fields are dropped when persisting (no password smuggling)', async (t) => {
  const temp = useTempConfigDir();
  t.after(temp.cleanup);

  await saveProfile('main', { provider: 'native', password: 'super-secret' });
  const raw = fs.readFileSync(path.join(temp.dir, 'profiles', 'main.json'), 'utf8');
  assert.ok(!raw.includes('super-secret'), 'passwords must never be written to profile files');
  assert.ok(!raw.includes('"password"'));
});

test('removeProfile is idempotent', async (t) => {
  const temp = useTempConfigDir();
  t.after(temp.cleanup);

  await saveProfile('main', { provider: 'native' });
  await removeProfile('main');
  await removeProfile('main');
  assert.deepEqual(await listProfiles(), []);
});

test('defaultProfile returns a fresh, valid object', () => {
  const a = defaultProfile('x');
  const b = defaultProfile('x');
  assert.notEqual(a, b);
  assert.equal(a.name, 'x');
});
