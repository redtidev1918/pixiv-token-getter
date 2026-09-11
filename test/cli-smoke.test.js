/**
 * CLI smoke tests. These spawn the real binary but never touch the network or
 * Pixiv: every command exercised here fails before any auth work happens.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CLI = path.join(__dirname, '..', 'cli.js');
const pkg = require('../package.json');

/**
 * Run the CLI in an isolated state directory.
 * @param {string[]} args
 * @param {NodeJS.ProcessEnv} [extraEnv]
 * @returns {Promise<{ code: number, stdout: string, stderr: string }>}
 */
function runCli(args, extraEnv = {}) {
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ptg-cli-'));
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [CLI, ...args],
      {
        env: {
          ...process.env,
          PIXIV_TOKEN_GETTER_CONFIG_DIR: configDir,
          ...extraEnv,
        },
      },
      (error, stdout, stderr) => {
        fs.rmSync(configDir, { recursive: true, force: true });
        resolve({ code: error ? (error.code === undefined ? 1 : error.code) : 0, stdout, stderr });
      }
    );
  });
}

test('--version prints the package version and exits 0', async () => {
  const { code, stdout } = await runCli(['--version']);
  assert.equal(code, 0);
  assert.match(stdout, new RegExp(pkg.version.replace(/\./g, '\\.')));
});

test('--help lists the new commands', async () => {
  const { code, stdout } = await runCli(['--help']);
  assert.equal(code, 0);
  assert.match(stdout, /Commands:/);
  assert.match(stdout, /import gppt/);
  assert.match(stdout, /ptg login/);
});

test('status on an empty state reports "missing" and exits non-zero', async () => {
  const { code, stdout } = await runCli(['status']);
  assert.equal(code, 4);
  assert.match(stdout, /Access token:\s+missing/);
});

test('status --json emits machine-readable state without secrets', async () => {
  const { code, stdout } = await runCli(['status', '--json']);
  assert.equal(code, 4);
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.profile, 'default');
  assert.equal(parsed.hasToken, false);
  assert.equal(parsed.refreshToken.present, false);
});

test('token on an empty state exits with the state exit code', async () => {
  const { code, stderr } = await runCli(['token']);
  assert.equal(code, 4);
  assert.match(stderr, /No stored token/);
});

test('import without a source is a usage error', async () => {
  const { code, stderr } = await runCli(['import']);
  assert.equal(code, 2);
  assert.match(stderr, /Usage: ptg import gppt/);
});

test('import of an unsupported source is a usage error', async () => {
  const { code, stderr } = await runCli(['import', 'safari']);
  assert.equal(code, 2);
  assert.match(stderr, /Unsupported import source/);
});

test('import gppt without gppt installed gives an actionable error', async () => {
  const { code, stderr } = await runCli(['import', 'gppt'], {
    PIXIV_TOKEN_GETTER_GPPT_BIN: 'definitely-not-a-real-gppt-binary',
    PATH: '/nonexistent-path-for-tests',
  });
  assert.equal(code, 3);
  assert.match(stderr, /gppt is not available/i);
  assert.match(stderr, /pip install gppt/);
  assert.match(stderr, /native provider does not need gppt/i);
});

test('import gppt reads a token file when gppt is present', async () => {
  const gpptDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ptg-cli-gppt-'));
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ptg-cli-bin-'));
  const bin = path.join(binDir, 'gppt');
  fs.writeFileSync(bin, '#!/bin/sh\necho "gppt 5.0.0"\n');
  fs.chmodSync(bin, 0o755);
  fs.writeFileSync(
    path.join(gpptDir, 'default.token.json'),
    JSON.stringify({
      access_token: 'cli-imported-access',
      refresh_token: 'cli-imported-refresh',
      expires_in: 3600,
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      user_name: 'cli-imported',
    })
  );

  try {
    const { code, stdout } = await runCli(['import', 'gppt'], {
      GPPT_CONFIG_DIR: gpptDir,
      PIXIV_TOKEN_GETTER_GPPT_BIN: bin,
    });
    assert.equal(code, 0);
    assert.match(stdout, /Imported gppt credential/);
    assert.match(stdout, /cli-imported/);
    // Secrets must stay masked.
    assert.ok(!stdout.includes('cli-imported-access'));
    assert.ok(!stdout.includes('cli-imported-refresh'));
    assert.match(stdout, /Web session:\s+not available/);
  } finally {
    fs.rmSync(gpptDir, { recursive: true, force: true });
    fs.rmSync(binDir, { recursive: true, force: true });
  }
});

test('an unknown command is a usage error', async () => {
  const { code, stderr } = await runCli(['teleport']);
  assert.equal(code, 2);
  assert.match(stderr, /Unknown command/);
});

test('login --method e2e without credentials is a usage error', async () => {
  const { code, stderr } = await runCli(['login', '--method', 'e2e'], {
    PIXIV_USERNAME: '',
    PIXIV_PASSWORD: '',
  });
  assert.equal(code, 2);
  assert.match(stderr, /needs a username and password/);
});
