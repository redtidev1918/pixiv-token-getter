const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const pixivAuth = require('../lib/pixiv-auth');
const pkg = require('..');
const { MemoryTokenStore } = require('../lib/auth/token/store');
const { useTempConfigDir } = require('./helpers');

test('the legacy module still exports its historical surface', () => {
  for (const name of [
    'loginInteractive',
    'loginHeadless',
    'generateCodeVerifier',
    'generateCodeChallenge',
    'exchangeCodeForToken',
    'collectWebCookies',
  ]) {
    assert.equal(typeof pixivAuth[name], 'function', `${name} should still be a function`);
  }
  assert.equal(typeof pixivAuth.DEFAULT_USER_DATA_DIR, 'string');
});

test('DEFAULT_USER_DATA_DIR points at the multi-profile browser layout', () => {
  assert.ok(
    pixivAuth.DEFAULT_USER_DATA_DIR.endsWith(path.join('browser', 'default')),
    `unexpected dir: ${pixivAuth.DEFAULT_USER_DATA_DIR}`
  );
  assert.ok(path.isAbsolute(pixivAuth.DEFAULT_USER_DATA_DIR));
});

test('the package root keeps the legacy API and adds the new lifecycle API', () => {
  assert.equal(typeof pkg.getTokenInteractive, 'function');
  assert.equal(typeof pkg.getTokenHeadless, 'function');
  assert.equal(typeof pkg.loginInteractive, 'function');
  assert.equal(typeof pkg.loginHeadless, 'function');
  assert.equal(typeof pkg.collectWebCookies, 'function');
  assert.equal(typeof pkg.DEFAULT_USER_DATA_DIR, 'string');

  assert.equal(typeof pkg.getToken, 'function');
  assert.equal(typeof pkg.login, 'function');
  assert.equal(typeof pkg.refreshToken, 'function');
  assert.equal(typeof pkg.refreshStoredToken, 'function');
  assert.equal(typeof pkg.status, 'function');
  assert.equal(typeof pkg.logout, 'function');
  assert.equal(typeof pkg.importGppt, 'function');
  assert.equal(typeof pkg.loadProfile, 'function');
  assert.equal(typeof pkg.saveProfile, 'function');
  assert.equal(typeof pkg.resolveToken, 'function');
  assert.equal(typeof pkg.isTokenExpired, 'function');
});

test('the default export exposes both layers', () => {
  assert.equal(typeof pkg.default.getTokenInteractive, 'function');
  assert.equal(typeof pkg.default.getTokenHeadless, 'function');
  assert.equal(typeof pkg.default.getToken, 'function');
});

test('legacy headless login still refuses empty credentials', async () => {
  await assert.rejects(() => pixivAuth.loginHeadless({ username: '', password: 'x' }), /Username/);
  await assert.rejects(() => pixivAuth.loginHeadless({ username: 'u', password: '' }), /Password/);
  await assert.rejects(() => pkg.getTokenHeadless({ username: 'u' }), /Username and password/);
});

test('legacy code challenge helpers keep working without a browser', () => {
  const verifier = pixivAuth.generateCodeVerifier();
  assert.ok(verifier.length > 40);
  assert.equal(pixivAuth.generateCodeChallenge(verifier), pkg.generateCodeChallenge(verifier));
});

test('legacy error classes are still Error subclasses (catch blocks keep working)', () => {
  const error = new pkg.LoginError('nope');
  assert.ok(error instanceof pkg.AuthError);
  assert.ok(error instanceof Error);
  assert.equal(error.code, 'LOGIN_ERROR');
});

test('importGppt wires the gppt file into the token store', async (t) => {
  const temp = useTempConfigDir();
  t.after(temp.cleanup);

  const gpptDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ptg-import-'));
  t.after(() => fs.rmSync(gpptDir, { recursive: true, force: true }));
  fs.writeFileSync(
    path.join(gpptDir, 'default.token.json'),
    JSON.stringify({
      access_token: 'imported-access',
      refresh_token: 'imported-refresh',
      expires_in: 3600,
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      user_id: '7',
      user_name: 'imported',
    })
  );

  const previous = process.env.GPPT_CONFIG_DIR;
  process.env.GPPT_CONFIG_DIR = gpptDir;
  try {
    const store = new MemoryTokenStore();
    const token = await pkg.importGppt({ profile: 'main', store });
    assert.equal(token.access_token, 'imported-access');
    assert.equal(token.web_cookies, undefined);
    assert.equal((await store.load('main')).refresh_token, 'imported-refresh');
  } finally {
    if (previous === undefined) delete process.env.GPPT_CONFIG_DIR;
    else process.env.GPPT_CONFIG_DIR = previous;
  }
});

test('maskSecret never reveals the whole secret', () => {
  assert.equal(pkg.maskSecret('abcdefghijklmnop'), '********mnop');
  assert.equal(pkg.maskSecret(''), '-');
  assert.equal(pkg.maskSecret(null), '-');
});

test('the published package exposes the same version as package.json', () => {
  assert.equal(pkg.version, require('../package.json').version);
});
