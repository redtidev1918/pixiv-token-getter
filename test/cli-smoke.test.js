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

test('removed import command and provider options are usage errors', async () => {
  for (const args of [
    ['import', 'gppt'],
    ['login', '--provider', 'gppt'],
    ['login', '--provider', 'auto'],
    ['login', '--method', 'import'],
  ]) {
    const { code } = await runCli(args);
    assert.equal(code, 2, args.join(' '));
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
