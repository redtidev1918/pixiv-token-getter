const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { FileTokenStore, MemoryTokenStore, writeFileAtomic } = require('../lib/auth/token/store');
const { TokenStoreError } = require('../lib/errors');
const { useTempConfigDir } = require('./helpers');

/** @returns {import('../lib/auth/token/token-info').TokenInfo} */
function sampleToken(overrides = {}) {
  return {
    access_token: 'access-1',
    refresh_token: 'refresh-1',
    expires_in: 3600,
    expires_at: new Date(Date.now() + 3600_000).toISOString(),
    obtained_at: new Date().toISOString(),
    token_type: 'bearer',
    scope: '',
    ...overrides,
  };
}

test('FileTokenStore round-trips a token', async (t) => {
  const temp = useTempConfigDir();
  t.after(temp.cleanup);

  const store = new FileTokenStore();
  assert.equal(await store.load('default'), null);

  await store.save('default', sampleToken());
  const loaded = await store.load('default');
  assert.equal(loaded.access_token, 'access-1');
  assert.deepEqual(await store.list(), ['default']);
});

test('token files are created with 0600 permissions on POSIX', async (t) => {
  if (process.platform === 'win32') return t.skip('POSIX permissions only');
  const temp = useTempConfigDir();
  t.after(temp.cleanup);

  const store = new FileTokenStore();
  await store.save('default', sampleToken());

  const mode = fs.statSync(store.pathFor('default')).mode & 0o777;
  assert.equal(mode, 0o600, `expected 0600, got ${mode.toString(8)}`);

  const dirMode = fs.statSync(path.dirname(store.pathFor('default'))).mode & 0o777;
  assert.equal(dirMode, 0o700, `expected 0700, got ${dirMode.toString(8)}`);
});

test('a failed save keeps the previous token file intact', async (t) => {
  const temp = useTempConfigDir();
  t.after(temp.cleanup);

  const store = new FileTokenStore();
  await store.save('default', sampleToken({ access_token: 'GOOD' }));

  const before = fs.readFileSync(store.pathFor('default'), 'utf8');
  await assert.rejects(() => store.save('default', { refresh_token: 'r' }), TokenStoreError);
  const after = fs.readFileSync(store.pathFor('default'), 'utf8');

  assert.equal(after, before);
  assert.equal(JSON.parse(after).access_token, 'GOOD');
});

test('writes are atomic: no partial file and no temp files left behind', async (t) => {
  const temp = useTempConfigDir();
  t.after(temp.cleanup);

  const store = new FileTokenStore();
  await store.save('default', sampleToken());
  const entries = fs.readdirSync(path.dirname(store.pathFor('default')));
  assert.deepEqual(entries, ['default.token.json']);
});

test('a corrupt token file is treated as absent (fail-soft → re-login)', async (t) => {
  const temp = useTempConfigDir();
  t.after(temp.cleanup);

  const store = new FileTokenStore();
  fs.mkdirSync(path.dirname(store.pathFor('default')), { recursive: true });
  fs.writeFileSync(store.pathFor('default'), '{ not json');
  assert.equal(await store.load('default'), null);

  fs.writeFileSync(store.pathFor('default'), JSON.stringify({ refresh_token: 'r' }));
  assert.equal(await store.load('default'), null, 'shape without access_token is unusable');
});

test('remove is idempotent', async (t) => {
  const temp = useTempConfigDir();
  t.after(temp.cleanup);

  const store = new FileTokenStore();
  await store.save('default', sampleToken());
  await store.remove('default');
  assert.equal(await store.load('default'), null);
  await store.remove('default'); // must not throw
});

test('profiles are isolated from each other', async (t) => {
  const temp = useTempConfigDir();
  t.after(temp.cleanup);

  const store = new FileTokenStore();
  await store.save('main', sampleToken({ access_token: 'main-token' }));
  await store.save('alt', sampleToken({ access_token: 'alt-token' }));

  assert.equal((await store.load('main')).access_token, 'main-token');
  assert.equal((await store.load('alt')).access_token, 'alt-token');
  assert.deepEqual((await store.list()).sort(), ['alt', 'main']);
});

test('profile names cannot escape the state directory', async (t) => {
  const temp = useTempConfigDir();
  t.after(temp.cleanup);

  const store = new FileTokenStore();
  await assert.rejects(() => store.save('../evil', sampleToken()));
  assert.throws(() => store.pathFor('../../etc/passwd'));
  assert.throws(() => store.pathFor('..'));
  assert.throws(() => store.pathFor(''));
});

test('writeFileAtomic does not truncate an existing target on failure', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ptg-atomic-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const file = path.join(dir, 'token.json');
  writeFileAtomic(file, 'ORIGINAL');
  assert.throws(() => writeFileAtomic(dir, 'REPLACEMENT')); // writing to a directory fails
  assert.equal(fs.readFileSync(file, 'utf8'), 'ORIGINAL');
});

test('MemoryTokenStore implements the same contract', async () => {
  const store = new MemoryTokenStore();
  assert.equal(await store.load('default'), null);
  await store.save('default', sampleToken());
  assert.equal((await store.load('default')).access_token, 'access-1');
  await store.remove('default');
  assert.equal(await store.load('default'), null);
});
