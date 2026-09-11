const test = require('node:test');
const assert = require('node:assert/strict');

const { parseArgs, CliUsageError } = require('../lib/cli/args');

test('no arguments defaults to an interactive login', () => {
  const parsed = parseArgs([]);
  assert.equal(parsed.command, 'login');
  assert.equal(parsed.legacy, false);
});

test('new command interface parses provider / method / profile', () => {
  const parsed = parseArgs(['login', '--provider', 'gppt', '--method', 'import', '--profile', 'main']);
  assert.equal(parsed.command, 'login');
  assert.equal(parsed.options.provider, 'gppt');
  assert.equal(parsed.options.method, 'import');
  assert.equal(parsed.options.profile, 'main');
  assert.equal(parsed.legacy, false);
});

test('--flag=value form is accepted', () => {
  const parsed = parseArgs(['refresh', '--profile=alt', '--json']);
  assert.equal(parsed.command, 'refresh');
  assert.equal(parsed.options.profile, 'alt');
  assert.equal(parsed.options.json, true);
});

test('legacy --interactive maps to login --method browser', () => {
  const parsed = parseArgs(['--interactive']);
  assert.equal(parsed.command, 'login');
  assert.equal(parsed.options.method, 'browser');
  assert.equal(parsed.legacy, true);
  assert.equal(parsed.options.output, 'pixiv-token.json');
  assert.match(parsed.warnings.join(' '), /deprecated/);
});

test('legacy --headless <user> <pass> maps to login --method e2e', () => {
  const parsed = parseArgs(['--headless', 'alice', 's3cret']);
  assert.equal(parsed.command, 'login');
  assert.equal(parsed.options.method, 'e2e');
  assert.equal(parsed.options.username, 'alice');
  assert.equal(parsed.options.password, 's3cret');
  assert.equal(parsed.options.output, 'pixiv-token.json');
  assert.equal(parsed.legacy, true);
});

test('legacy --headless with explicit credential flags', () => {
  const parsed = parseArgs(['--headless', '--username=alice', '--password=s3cret', '--output=token.json']);
  assert.equal(parsed.options.username, 'alice');
  assert.equal(parsed.options.password, 's3cret');
  assert.equal(parsed.options.output, 'token.json');
});

test('legacy --output without a command keeps working', () => {
  const parsed = parseArgs(['--output=my-token.json']);
  assert.equal(parsed.command, 'login');
  assert.equal(parsed.options.output, 'my-token.json');
  assert.equal(parsed.legacy, true);
});

test('legacy interactive + output combination', () => {
  const parsed = parseArgs(['--interactive', '--output=custom.json']);
  assert.equal(parsed.options.method, 'browser');
  assert.equal(parsed.options.output, 'custom.json');
});

test('import requires a subcommand', () => {
  const parsed = parseArgs(['import', 'gppt', '--profile', 'main']);
  assert.equal(parsed.command, 'import');
  assert.equal(parsed.subcommand, 'gppt');
  assert.equal(parsed.options.profile, 'main');
});

test('status / token / configure / logout flags', () => {
  assert.equal(parseArgs(['status', '--json']).options.json, true);
  assert.equal(parseArgs(['token', '--show-secret']).options.showSecret, true);
  assert.equal(parseArgs(['configure', '--list']).options.list, true);
  assert.equal(parseArgs(['logout', '--purge']).options.purge, true);
  assert.equal(parseArgs(['login', '--force', '--quiet']).options.force, true);
  assert.equal(parseArgs(['login', '--totp-code=123456']).options.totpCode, '123456');
});

test('help and version are recognised from either position', () => {
  assert.equal(parseArgs(['--help']).command, 'help');
  assert.equal(parseArgs(['-h']).command, 'help');
  assert.equal(parseArgs(['--version']).command, 'version');
  assert.equal(parseArgs(['-v']).command, 'version');
  assert.equal(parseArgs(['help']).command, 'help');
});

test('unknown commands and options are rejected', () => {
  assert.throws(() => parseArgs(['teleport']), CliUsageError);
  assert.throws(() => parseArgs(['--nope']), CliUsageError);
  assert.throws(() => parseArgs(['login', '--profile']), CliUsageError);
});

test('everything after -- is treated as positional', () => {
  const parsed = parseArgs(['login', '--', '--weird']);
  assert.equal(parsed.command, 'login');
});
