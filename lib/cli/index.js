/**
 * CLI dispatcher.
 *
 * Commands: login | refresh | status | configure | logout | import | token | help | version
 * Legacy flags: --interactive | --headless [user] [pass] | --output=<file>
 */

const readline = require('readline');

const { parseArgs, CliUsageError } = require('./args');
const out = require('./output');
const errors = require('../errors');
const lifecycle = require('../auth/token/lifecycle');
const profileStore = require('../auth/profile/profile-store');
const gppt = require('../auth/providers/gppt');
const { FileTokenStore } = require('../auth/token/store');
const { getConfigDir, getBrowserDir } = require('../paths');

const pkg = require('../../package.json');

/** Exit codes (stable; useful for CI). */
const EXIT = {
  OK: 0,
  ERROR: 1,
  USAGE: 2,
  PROVIDER_UNAVAILABLE: 3,
  STATE: 4,
};

/**
 * Prompt for a value on the TTY (used for TOTP).
 * @param {string} question
 * @returns {Promise<string>}
 */
function promptQuestion(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(String(answer).trim());
    });
  });
}

/**
 * @param {string} message
 * @param {{ error?: boolean }} [options]
 */
function log(message, options = {}) {
  if (options.error) out.printError(message);
  else out.print(message);
}

/** Help text. */
function showHelp() {
  out.print(
    [
      'pixiv-token-getter - Node.js Pixiv credential manager',
      '',
      'Usage:',
      '  ptg <command> [options]           (short alias, recommended)',
      '  pixiv-token-getter <command>      (full command name)',
      '',
      'Commands:',
      '  login                 Log in / store a credential (cache → refresh → login)',
      '  refresh               Refresh the stored access token',
      '  status                Show credential state (never prints secrets)',
      '  configure             Save non-secret profile preferences',
      '  logout                Remove stored credentials',
      '  import gppt           Import a credential from gppt (~/.config/gppt)',
      '  token                 Print the stored token (masked unless --show-secret)',
      '',
      'Common options:',
      '  --profile=<name>      Profile to operate on (default: default)',
      '  --provider=<id>       native | gppt | auto        (default: native)',
      '  --method=<method>     oauth | browser | e2e | import',
      '  --json                Machine-readable output',
      '  --quiet               Suppress progress messages',
      '  --proxy=<url>         Explicit proxy (else ALL_PROXY/HTTPS_PROXY/HTTP_PROXY)',
      '  --help, -h            Show this help',
      '  --version, -v         Show version',
      '',
      'Login options:',
      '  --username=<user>     Username (or PIXIV_USERNAME) for --method e2e',
      '  --password=<pass>     Password (or PIXIV_PASSWORD) for --method e2e',
      '  --totp-code=<code>    TOTP second factor',
      '  --force               Skip the cache and log in again',
      '  --output=<file>       Also write a legacy token JSON file (0600)',
      '',
      'Examples:',
      '  ptg login',
      '  ptg login --method browser',
      '  PIXIV_USERNAME=user PIXIV_PASSWORD=pass ptg login --method e2e',
      '  ptg refresh --profile main',
      '  ptg status --json',
      '  ptg import gppt --profile main',
      '',
      'Legacy flags (still supported, deprecated):',
      '  ptg --interactive                 → ptg login --method browser',
      '  ptg --headless <user> <pass>      → ptg login --method e2e',
      '  ptg --output=<file>               → also write a legacy token file',
      '',
      'Notes:',
      `  - State lives under ${getConfigDir()} (profiles/, tokens/, browser/).`,
      '  - gppt is OPTIONAL. Install it with "pip install gppt" for interoperability.',
      '  - Secrets are masked by default; use --show-secret only when you must.',
    ].join('\n')
  );
}

/**
 * Handle `ptg login`.
 * @param {any} parsed
 * @returns {Promise<number>}
 */
async function handleLogin(parsed) {
  const { options, legacy, warnings } = parsed;
  for (const warning of warnings) out.printError(`[!] Deprecation: ${warning}`);

  const profileName = options.profile || 'default';
  const profile = await profileStore.loadProfile(profileName);
  const provider = options.provider || profile.provider;
  const method = options.method || (legacy ? 'browser' : profile.method);

  const username = options.username || process.env.PIXIV_USERNAME || null;
  const password = options.password || process.env.PIXIV_PASSWORD || null;

  if (method === 'e2e' && (!username || !password)) {
    throw new CliUsageError(
      'Login method "e2e" needs a username and password.\n' +
        '    Pass --username/--password or set PIXIV_USERNAME / PIXIV_PASSWORD.'
    );
  }
  if (method === 'import' && provider !== 'gppt' && !options.sourceProfile) {
    throw new CliUsageError('Login method "import" requires --provider gppt (or use "ptg import gppt").');
  }

  if (!options.quiet && !options.json) {
    out.print(`[i] Profile: ${profileName} | provider: ${provider} | method: ${method}`);
    out.print('[i] Resolving credential (cache → refresh → login)...');
    if (method !== 'e2e' && method !== 'import') {
      out.print('[i] A browser window will open shortly. Complete the login there.');
    }
  }

  const totpPrompt = async () => {
    out.print('[!] Pixiv requested a two-factor code.');
    return promptQuestion('Two-factor code: ');
  };

  const token = await lifecycle.login({
    profile: profileName,
    profileConfig: profile,
    provider,
    method,
    username,
    password,
    totpCode: options.totpCode,
    totpSecret: options.totpSecret,
    totpPrompt,
    timeout: options.timeout ? Number(options.timeout) : undefined,
    proxy: options.proxy === undefined ? profile.proxy : options.proxy,
    userDataDir: options.userDataDir,
  });

  token.profile = profileName;

  if (options.output) {
    out.saveTokenToFile(token, options.output);
  }

  if (options.json) {
    log(JSON.stringify(out.maskTokenForJson(token, Boolean(options.showSecret)), null, 2));
    return EXIT.OK;
  }

  const name = token.user && (token.user.name || token.user.account);
  if (name) out.print(`[+] Logged in as ${name}${token.user.id ? ` (ID: ${token.user.id})` : ''}`);
  else out.print('[+] Logged in');

  for (const line of out.formatToken(token, { showSecret: false })) out.print(`    ${line}`);
  out.print('[+] Refresh token saved securely.');
  out.print(
    `    Token file: ${new FileTokenStore().pathFor(profileName)} (permissions 0600)`
  );
  out.print('[i] Next time just run "ptg status" or use getToken() from the library.');
  return EXIT.OK;
}

/**
 * Handle `ptg refresh`.
 * @param {any} parsed
 * @returns {Promise<number>}
 */
async function handleRefresh(parsed) {
  const { options } = parsed;
  const profileName = options.profile || 'default';

  const token = await lifecycle.refreshStoredToken({
    profile: profileName,
    proxy: options.proxy,
  });
  token.profile = profileName;

  if (options.json) {
    log(JSON.stringify(out.maskTokenForJson(token, Boolean(options.showSecret)), null, 2));
    return EXIT.OK;
  }
  out.print(`[+] Refreshed access token for profile "${profileName}".`);
  for (const line of out.formatToken(token, { showSecret: false })) out.print(`    ${line}`);
  return EXIT.OK;
}

/**
 * Handle `ptg status`.
 * @param {any} parsed
 * @returns {Promise<number>}
 */
async function handleStatus(parsed) {
  const { options } = parsed;
  const info = await lifecycle.status({ profile: options.profile || 'default' });

  if (options.json) {
    log(JSON.stringify(info, null, 2));
    return info.hasToken ? EXIT.OK : EXIT.STATE;
  }
  for (const line of out.formatStatus(info)) out.print(line);
  return info.hasToken ? EXIT.OK : EXIT.STATE;
}

/**
 * Handle `ptg configure`.
 * @param {any} parsed
 * @returns {Promise<number>}
 */
async function handleConfigure(parsed) {
  const { options } = parsed;
  const profileName = options.profile || 'default';

  if (options.list) {
    const names = await profileStore.listProfiles();
    const known = names.length ? names : ['default (implicit)'];
    out.print('Profiles:');
    for (const name of known) {
      const clean = name.replace(' (implicit)', '');
      // eslint-disable-next-line no-await-in-loop
      const profile = await profileStore.loadProfile(clean);
      out.print(`  ${clean}  provider=${profile.provider}  method=${profile.method}`);
    }
    out.print(`Config dir: ${getConfigDir()}`);
    return EXIT.OK;
  }

  const patch = {};
  if (options.provider) patch.provider = options.provider;
  if (options.method) patch.method = options.method;
  if (options.userDataDir) patch.userDataDir = options.userDataDir;
  if (options.proxy) patch.proxy = options.proxy;

  if (Object.keys(patch).length === 0) {
    out.print('Nothing to configure. Pass --provider, --method, --user-data-dir and/or --proxy.');
    out.print('Use "ptg configure --list" to inspect existing profiles.');
    return EXIT.OK;
  }

  const saved = await profileStore.saveProfile(profileName, patch);
  if (options.json) {
    log(JSON.stringify(saved, null, 2));
    return EXIT.OK;
  }
  out.print(`[+] Profile "${profileName}" saved.`);
  out.print(`    provider: ${saved.provider}`);
  out.print(`    method:   ${saved.method}`);
  if (saved.proxy) out.print(`    proxy:    ${out.describeProxy(typeof saved.proxy === 'string' ? { url: saved.proxy } : saved.proxy) || saved.proxy}`);
  out.print(`    browser:  ${saved.userDataDir || getBrowserDir(profileName)}`);
  out.print('    (passwords are never stored)');
  return EXIT.OK;
}

/**
 * Handle `ptg logout`.
 * @param {any} parsed
 * @returns {Promise<number>}
 */
async function handleLogout(parsed) {
  const { options } = parsed;
  const result = await lifecycle.logout({
    profile: options.profile || 'default',
    purge: Boolean(options.purge),
  });

  if (options.json) {
    log(JSON.stringify(result, null, 2));
    return EXIT.OK;
  }
  out.print(
    result.tokenRemoved
      ? `[+] Removed stored credential for profile "${result.profile}".`
      : `[i] No stored credential for profile "${result.profile}".`
  );
  if (result.profileRemoved) out.print('    Profile preferences removed.');
  if (result.browserRemoved) out.print('    Browser profile removed.');
  return EXIT.OK;
}

/**
 * Handle `ptg import <provider>`.
 * @param {any} parsed
 * @returns {Promise<number>}
 */
async function handleImport(parsed) {
  const { options, subcommand } = parsed;
  if (!subcommand) {
    throw new CliUsageError('Usage: ptg import gppt [--profile <name>] [--source-profile <name>]');
  }
  if (subcommand !== 'gppt') {
    throw new CliUsageError(`Unsupported import source "${subcommand}". Currently supported: gppt`);
  }

  if (!(await gppt.isAvailable())) {
    throw new errors.ProviderUnavailableError(
      [
        'gppt is not available.',
        '  Install it with:  pip install gppt',
        '  Then run:         gppt configure && gppt login',
        '  Finally:          ptg import gppt',
        '',
        'Note: the native provider does not need gppt at all — "ptg login" works standalone.',
      ].join('\n')
    );
  }

  const profileName = options.profile || 'default';
  const sourceProfile = options.sourceProfile || gppt.GPPT_DEFAULT_PROFILE;

  // Read the structured gppt token file and normalise it (never parse stdout).
  const imported = await gppt.login({ method: 'import', sourceProfile });
  await new FileTokenStore().save(profileName, imported);
  imported.profile = profileName;

  if (options.json) {
    log(JSON.stringify(out.maskTokenForJson(imported, Boolean(options.showSecret)), null, 2));
    return EXIT.OK;
  }
  out.print(`[+] Imported gppt credential into profile "${profileName}".`);
  out.print(`    Source profile: ${sourceProfile}`);
  for (const line of out.formatToken(imported, { showSecret: false })) out.print(`    ${line}`);
  out.print('[i] gppt tokens carry no web session: "Web session" stays unavailable by design.');
  return EXIT.OK;
}

/**
 * Handle `ptg token`.
 * @param {any} parsed
 * @returns {Promise<number>}
 */
async function handleToken(parsed) {
  const { options } = parsed;
  const profileName = options.profile || 'default';
  const store = new FileTokenStore();
  const token = await store.load(profileName);

  if (!token) {
    out.printError(`[!] No stored token for profile "${profileName}". Run "ptg login".`);
    return EXIT.STATE;
  }
  token.profile = profileName;

  if (options.json) {
    log(JSON.stringify(out.maskTokenForJson(token, Boolean(options.showSecret)), null, 2));
    return EXIT.OK;
  }
  for (const line of out.formatToken(token, { showSecret: Boolean(options.showSecret) })) {
    out.print(line);
  }
  if (!options.showSecret) {
    out.print('');
    out.print('[i] Secrets are masked. Use --show-secret only if you must expose them.');
  }
  return EXIT.OK;
}

/**
 * Map an error to a stable exit code + message.
 * @param {unknown} error
 * @returns {number}
 */
function exitCodeFor(error) {
  if (error instanceof CliUsageError) return EXIT.USAGE;
  if (error instanceof errors.ProviderUnavailableError) return EXIT.PROVIDER_UNAVAILABLE;
  if (error instanceof errors.ProfileError) return EXIT.STATE;
  if (error instanceof errors.TokenStoreError) return EXIT.STATE;
  return EXIT.ERROR;
}

/**
 * CLI entry point.
 * @param {string[]} [argv=process.argv.slice(2)]
 * @returns {Promise<number>} exit code
 */
async function main(argv = process.argv.slice(2)) {
  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (error) {
    out.printError(`[!] Error: ${error.message}`);
    out.printError('');
    showHelp();
    return EXIT.USAGE;
  }

  try {
    switch (parsed.command) {
      case 'help':
        showHelp();
        return EXIT.OK;
      case 'version':
        out.print(`pixiv-token-getter v${pkg.version}`);
        return EXIT.OK;
      case 'login':
        return await handleLogin(parsed);
      case 'refresh':
        return await handleRefresh(parsed);
      case 'status':
        return await handleStatus(parsed);
      case 'configure':
        return await handleConfigure(parsed);
      case 'logout':
        return await handleLogout(parsed);
      case 'import':
        return await handleImport(parsed);
      case 'token':
        return await handleToken(parsed);
      default:
        out.printError(`[!] Unknown command: ${parsed.command}`);
        showHelp();
        return EXIT.USAGE;
    }
  } catch (error) {
    // Only the sanitised message is ever printed — never a token or a raw body.
    out.printError(`\n[!] Error: ${error && error.message ? error.message : error}`);
    if (error && error.code === 'TWO_FACTOR_REQUIRED') {
      out.printError('[i] Supply --totp-code=<code> (or --totp-secret) and try again.');
    }
    return exitCodeFor(error);
  }
}

module.exports = { EXIT, main, showHelp, promptQuestion };
