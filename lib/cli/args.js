/**
 * CLI argument parsing (pure — no I/O, no process.exit, easy to unit test).
 *
 * Supports both the new command interface and the legacy flag-only interface:
 *
 *   ptg login --profile main --method browser      (new)
 *   ptg --interactive                              (legacy → login --method browser)
 *   ptg --headless user pass                       (legacy → login --method e2e)
 *   ptg --interactive --output=my.json             (legacy)
 */

/** Recognised commands. */
const COMMANDS = ['login', 'refresh', 'status', 'configure', 'logout', 'import', 'token', 'help', 'version'];

/** Flags that consume a value. */
const VALUE_FLAGS = new Set([
  '--profile',
  '--provider',
  '--method',
  '--username',
  '--password',
  '--output',
  '--proxy',
  '--user-data-dir',
  '--source-profile',
  '--format',
  '--timeout',
  '--totp-code',
  '--totp-secret',
]);

/** Boolean flags. */
const BOOLEAN_FLAGS = new Set([
  '--json',
  '--quiet',
  '--force',
  '--purge',
  '--list',
  '--show-secret',
  '--headless',
  '--interactive',
  '--help',
  '-h',
  '--version',
  '-v',
  '-V',
  '--legacy-stdout',
]);

/** Usage error (exit code 2). */
class CliUsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CliUsageError';
  }
}

/**
 * @param {string} name
 * @returns {string} camelCase key
 */
function toCamel(name) {
  return name.replace(/^--/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

/**
 * Parse argv into a command descriptor.
 *
 * @param {string[]} argv
 * @returns {{
 *   command: string,
 *   subcommand: string|null,
 *   options: Record<string, any>,
 *   legacy: boolean,
 *   warnings: string[],
 * }}
 */
function parseArgs(argv = []) {
  const options = {};
  const positionals = [];
  const warnings = [];
  let helpRequested = false;
  let versionRequested = false;
  let legacyInteractive = false;
  let legacyHeadless = false;

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === '--') {
      positionals.push(...argv.slice(i + 1));
      break;
    }

    if (!token.startsWith('-') || token === '-') {
      positionals.push(token);
      continue;
    }

    const eqIndex = token.indexOf('=');
    const name = eqIndex === -1 ? token : token.slice(0, eqIndex);
    const inlineValue = eqIndex === -1 ? undefined : token.slice(eqIndex + 1);

    if (name === '-h') helpRequested = true;
    if (name === '-v' || name === '-V' || name === '--version') versionRequested = true;
    if (name === '--help') helpRequested = true;
    if (name === '--interactive') legacyInteractive = true;
    if (name === '--headless') legacyHeadless = true;

    if (VALUE_FLAGS.has(name)) {
      let value = inlineValue;
      if (value === undefined) {
        const next = argv[i + 1];
        if (next === undefined || (next.startsWith('--') && next !== '--')) {
          throw new CliUsageError(`Option ${name} requires a value`);
        }
        value = next;
        i += 1;
      }
      options[toCamel(name)] = value;
      continue;
    }

    if (BOOLEAN_FLAGS.has(name)) {
      options[toCamel(name)] = true;
      continue;
    }

    throw new CliUsageError(`Unknown option: ${name}`);
  }

  if (helpRequested && positionals.length === 0) {
    return { command: 'help', subcommand: null, options, legacy: false, warnings };
  }
  if (versionRequested && positionals.length === 0) {
    return { command: 'version', subcommand: null, options, legacy: false, warnings };
  }

  // ---- legacy flag-only interface ----------------------------------------
  if (legacyHeadless) {
    warnings.push('--headless is deprecated; use "ptg login --method e2e" instead.');
    const credentials = positionals.slice(0, 2);
    // Reject option-looking credentials, matching the historical CLI.
    const username = options.username || credentials[0];
    if (username && String(username).startsWith('--')) {
      throw new CliUsageError('Headless mode requires username and password');
    }
    return {
      command: 'login',
      subcommand: null,
      legacy: true,
      warnings,
      options: {
        ...options,
        method: 'e2e',
        username: username || null,
        password: options.password || credentials[1] || null,
        // Legacy default: write pixiv-token.json in the CWD unless overridden.
        output: options.output || (legacyInteractive ? undefined : 'pixiv-token.json'),
      },
    };
  }

  if (legacyInteractive) {
    warnings.push('--interactive is deprecated; use "ptg login --method browser" instead.');
    return {
      command: 'login',
      subcommand: null,
      legacy: true,
      warnings,
      options: {
        ...options,
        method: options.method || 'browser',
        output: options.output || 'pixiv-token.json',
      },
    };
  }

  const first = positionals[0];
  if (first && COMMANDS.includes(first)) {
    const subcommand = positionals[1] || null;
    return { command: first, subcommand, options, legacy: false, warnings };
  }

  if (first) {
    throw new CliUsageError(`Unknown command: ${first}`);
  }

  if (options.output) {
    // `ptg --output=file` (no mode flag) behaves like the legacy default mode.
    warnings.push('Passing --output without a command is deprecated; use "ptg login --output=<file>".');
    return {
      command: 'login',
      subcommand: null,
      legacy: true,
      warnings,
      options: { ...options, method: 'browser' },
    };
  }

  // `ptg` with no arguments → login (the historical default mode).
  return { command: 'login', subcommand: null, options, legacy: false, warnings };
}

module.exports = { COMMANDS, VALUE_FLAGS, BOOLEAN_FLAGS, CliUsageError, parseArgs };
