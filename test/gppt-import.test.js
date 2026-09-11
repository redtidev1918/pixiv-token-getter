const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const gppt = require('../lib/auth/providers/gppt');
const { ProfileError } = require('../lib/errors');

/**
 * Build an isolated gppt config dir with a token file.
 * @param {object} [token]
 * @param {string} [fileName]
 * @returns {{ dir: string, env: NodeJS.ProcessEnv, cleanup: () => void }}
 */
function gpptFixture(token, fileName = 'default.token.json') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ptg-gppt-'));
  if (token !== undefined) {
    fs.writeFileSync(path.join(dir, fileName), JSON.stringify(token, null, 2));
  }
  return {
    dir,
    env: { ...process.env, GPPT_CONFIG_DIR: dir },
    cleanup() {
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

const VALID_TOKEN = {
  access_token: 'gppt-access',
  refresh_token: 'gppt-refresh',
  expires_in: 3600,
  expires_at: new Date(Date.now() + 3600_000).toISOString(),
  token_type: 'bearer',
  scope: '',
  user_id: '555',
  user_name: 'gppt-user',
  user_account: 'gppt_account',
};

test('GPPT_CONFIG_DIR is honoured and ~ is expanded', () => {
  const dir = gppt.resolveGpptConfigDir({ GPPT_CONFIG_DIR: '/tmp/explicit-gppt' });
  assert.equal(dir, path.resolve('/tmp/explicit-gppt'));

  const xdg = gppt.resolveGpptConfigDir({ XDG_CONFIG_HOME: '/tmp/xdg-home' });
  assert.equal(xdg, path.join('/tmp/xdg-home', 'gppt'));

  const home = gppt.resolveGpptConfigDir({});
  assert.ok(home.endsWith(path.join('.config', 'gppt')));
});

test('a valid gppt token file normalises into TokenInfo', (t) => {
  const fixture = gpptFixture(VALID_TOKEN);
  t.after(fixture.cleanup);

  const { file, raw } = gppt.readGpptTokenFile('default', fixture.env);
  assert.ok(file.endsWith('default.token.json'));
  assert.equal(raw.access_token, 'gppt-access');

  const token = gppt.normalizeGpptToken(raw);
  assert.equal(token.access_token, 'gppt-access');
  assert.equal(token.refresh_token, 'gppt-refresh');
  assert.equal(token.provider, 'gppt');
  assert.deepEqual(token.user, { id: '555', name: 'gppt-user', account: 'gppt_account' });
  assert.ok(token.expires_at);
});

test('obtained_at is reconstructed from gppt absolute expiry', (t) => {
  const fixture = gpptFixture(VALID_TOKEN);
  t.after(fixture.cleanup);

  const { raw } = gppt.readGpptTokenFile('default', fixture.env);
  const token = gppt.normalizeGpptToken(raw);
  const expected = new Date(new Date(VALID_TOKEN.expires_at).getTime() - 3600_000).toISOString();
  assert.equal(token.obtained_at, expected);
});

test('gppt tokens never carry web cookies (no fabrication)', (t) => {
  const fixture = gpptFixture(VALID_TOKEN);
  t.after(fixture.cleanup);

  const { raw } = gppt.readGpptTokenFile('default', fixture.env);
  const token = gppt.normalizeGpptToken(raw);
  assert.equal(token.web_cookies, undefined);
});

test('a non-default gppt profile is read from <profile>.token.json', (t) => {
  const fixture = gpptFixture(VALID_TOKEN, 'alt.token.json');
  t.after(fixture.cleanup);

  const { raw } = gppt.readGpptTokenFile('alt', fixture.env);
  assert.equal(raw.access_token, 'gppt-access');
  assert.equal(gppt.findGpptTokenFile('missing', fixture.env), null);
});

test('the legacy bare .token.json is accepted for the default profile', (t) => {
  const fixture = gpptFixture(VALID_TOKEN, '.token.json');
  t.after(fixture.cleanup);

  const { file } = gppt.readGpptTokenFile('default', fixture.env);
  assert.ok(file.endsWith('.token.json'));
});

test('a missing token file explains how to fix it', (t) => {
  const fixture = gpptFixture(undefined);
  t.after(fixture.cleanup);

  assert.throws(
    () => gppt.readGpptTokenFile('default', fixture.env),
    (error) => error instanceof ProfileError && /gppt configure && gppt login/.test(error.message)
  );
});

test('malformed JSON is rejected', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ptg-gppt-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'default.token.json'), '{ not json');

  assert.throws(
    () => gppt.readGpptTokenFile('default', { ...process.env, GPPT_CONFIG_DIR: dir }),
    (error) => error instanceof ProfileError && /not valid JSON/.test(error.message)
  );
});

test('a token file without refresh_token is rejected', (t) => {
  const fixture = gpptFixture({ access_token: 'a' });
  t.after(fixture.cleanup);

  assert.throws(
    () => gppt.readGpptTokenFile('default', fixture.env),
    (error) => error instanceof ProfileError && /refresh_token/.test(error.message)
  );
});

test('a token file without access_token is rejected', (t) => {
  const fixture = gpptFixture({ refresh_token: 'r' });
  t.after(fixture.cleanup);

  assert.throws(
    () => gppt.readGpptTokenFile('default', fixture.env),
    (error) => error instanceof ProfileError && /access_token/.test(error.message)
  );
});

test('gppt.login({method:"import"}) does not require the gppt binary', async (t) => {
  const fixture = gpptFixture(VALID_TOKEN);
  t.after(fixture.cleanup);

  const token = await gppt.login({ method: 'import', env: fixture.env });
  assert.equal(token.access_token, 'gppt-access');
  assert.equal(token.method, 'import');
});

test('gppt profile names are validated', (t) => {
  const fixture = gpptFixture(VALID_TOKEN);
  t.after(fixture.cleanup);

  assert.throws(() => gppt.readGpptTokenFile('../evil', fixture.env), ProfileError);
});

test('unsupported gppt methods are rejected', () => {
  assert.throws(() => gppt.normalizeMethod('selenium'));
  assert.equal(gppt.normalizeMethod(undefined), 'import');
  assert.equal(gppt.normalizeMethod('e2e'), 'e2e');
});

test('isAvailable() is false when gppt is not on PATH', async () => {
  gppt.resetAvailabilityCache();
  const available = await gppt.isAvailable({
    force: true,
    env: { PATH: '/nonexistent-dir', PIXIV_TOKEN_GETTER_GPPT_BIN: 'definitely-not-a-real-binary' },
  });
  assert.equal(available, false);
});

test('isAvailable() is true when the gppt binary responds', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ptg-bin-'));
  const bin = path.join(dir, 'gppt');
  fs.writeFileSync(bin, '#!/bin/sh\necho "gppt 5.0.0"\n');
  fs.chmodSync(bin, 0o755);
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  gppt.resetAvailabilityCache();
  const available = await gppt.isAvailable({
    force: true,
    env: { ...process.env, PIXIV_TOKEN_GETTER_GPPT_BIN: bin },
  });
  assert.equal(available, true);
});
