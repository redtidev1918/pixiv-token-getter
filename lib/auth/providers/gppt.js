/**
 * gppt provider — OPTIONAL interoperability with `eggplants/get-pixivpy-token`.
 *
 * Design rules (deliberate, see README + ACKNOWLEDGMENTS):
 *  - Never a hard dependency: `npm install pixiv-token-getter` must work without Python.
 *  - Never parse gppt's stdout. gppt writes a structured token file; we read that.
 *  - gppt tokens carry no web session → `web_cookies` stays undefined (never faked).
 *  - `gppt login` is only ever spawned when the caller explicitly selects this
 *    provider; native users never pay for it.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const { ProviderUnavailableError, ProfileError, LoginError, AuthError } = require('../../errors');
const { normalizeTokenInfo, parseAbsoluteDate } = require('../token/token-info');
const { refreshAccessToken } = require('../oauth/token-exchange');
const { assertValidProfileName, expandHome } = require('../../paths');

const id = 'gppt';
const methods = ['import', 'e2e'];

/** Default profile name used by gppt when none is given. */
const GPPT_DEFAULT_PROFILE = 'default';

/** Env var gppt uses to locate its config dir. */
const GPPT_CONFIG_DIR_ENV = 'GPPT_CONFIG_DIR';

/** Escape hatch for custom installs (venv shims, `python -m gppt`, ...). */
const GPPT_BIN_ENV = 'PIXIV_TOKEN_GETTER_GPPT_BIN';

let cachedAvailability = null;

/**
 * Resolve the gppt config directory, mirroring gppt's own resolution
 * (`GPPT_CONFIG_DIR` → `$XDG_CONFIG_HOME/gppt` → `~/.config/gppt`).
 *
 * One improvement over gppt: we expand a leading `~`, which gppt does not.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
function resolveGpptConfigDir(env = process.env) {
  const override = env[GPPT_CONFIG_DIR_ENV];
  if (override && override.trim()) return path.resolve(expandHome(override.trim()));

  const xdg = env.XDG_CONFIG_HOME;
  const base = xdg && xdg.trim() ? expandHome(xdg.trim()) : path.join(os.homedir(), '.config');
  return path.join(base, 'gppt');
}

/**
 * Candidate token-file paths for a gppt profile.
 *
 * gppt v5 uses `<profile>.token.json`. Some docs/older builds mention the
 * bare `.token.json` for the default profile, so we try both.
 *
 * @param {string} [sourceProfile='default']
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string[]}
 */
function gpptTokenCandidates(sourceProfile = GPPT_DEFAULT_PROFILE, env = process.env) {
  const dir = resolveGpptConfigDir(env);
  const name = assertValidProfileName(sourceProfile);
  const candidates = [path.join(dir, `${name}.token.json`)];
  if (name === GPPT_DEFAULT_PROFILE) candidates.push(path.join(dir, '.token.json'));
  return candidates;
}

/**
 * Locate an existing gppt token file.
 * @param {string} [sourceProfile]
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string|null}
 */
function findGpptTokenFile(sourceProfile = GPPT_DEFAULT_PROFILE, env = process.env) {
  for (const candidate of gpptTokenCandidates(sourceProfile, env)) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch (error) {
      /* keep looking */
    }
  }
  return null;
}

/**
 * Read + parse a gppt token file.
 *
 * @param {string} [sourceProfile]
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ file: string, raw: object }}
 * @throws {ProfileError} when the file is missing or malformed
 */
function readGpptTokenFile(sourceProfile = GPPT_DEFAULT_PROFILE, env = process.env) {
  const file = findGpptTokenFile(sourceProfile, env);
  if (!file) {
    throw new ProfileError(
      `No gppt token file found for profile "${sourceProfile}". Looked in: ${gpptTokenCandidates(
        sourceProfile,
        env
      ).join(', ')}. Run "gppt configure && gppt login" first.`,
      { details: { configDir: resolveGpptConfigDir(env), profile: sourceProfile } }
    );
  }

  let content;
  try {
    content = fs.readFileSync(file, 'utf8');
  } catch (error) {
    throw new ProfileError(`Cannot read gppt token file ${file}: ${error.message}`, {
      cause: error,
      details: { file },
    });
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new ProfileError(`gppt token file is not valid JSON: ${file}`, {
      cause: error,
      details: { file },
    });
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new ProfileError(`gppt token file must contain a JSON object: ${file}`, {
      details: { file },
    });
  }
  if (!parsed.access_token) {
    throw new ProfileError(`gppt token file has no access_token: ${file}`, {
      details: { file },
    });
  }
  if (!parsed.refresh_token) {
    throw new ProfileError(
      `gppt token file has no refresh_token: ${file}. Re-run "gppt login" to obtain a full token pair.`,
      { details: { file } }
    );
  }

  return { file, raw: parsed };
}

/**
 * Convert a gppt token object into our TokenInfo.
 *
 * gppt stores `expires_at` (absolute ISO) and `expires_in`, plus flattened
 * `user_id` / `user_name` / `user_account`.
 *
 * @param {object} raw
 * @returns {import('../token/token-info').TokenInfo}
 */
function normalizeGpptToken(raw) {
  const absolute = parseAbsoluteDate(raw.expires_at);
  const expiresIn = Number(raw.expires_in) || 0;

  // Recover `obtained_at` from the absolute expiry when possible so the usual
  // expiry logic keeps working without trusting gppt's clock.
  let obtainedAt = new Date();
  if (absolute && expiresIn > 0) {
    obtainedAt = new Date(absolute.getTime() - expiresIn * 1000);
  }

  const token = normalizeTokenInfo(
    {
      access_token: raw.access_token,
      refresh_token: raw.refresh_token,
      expires_in: expiresIn,
      expires_at: raw.expires_at,
      token_type: raw.token_type || 'bearer',
      scope: raw.scope || '',
      user_id: raw.user_id,
      user_name: raw.user_name,
      user_account: raw.user_account,
    },
    { provider: id, method: 'import', obtainedAt }
  );

  // Explicitly never fabricate web cookies for a gppt token.
  delete token.web_cookies;
  return token;
}

/**
 * Is the `gppt` executable usable?
 * @param {{ force?: boolean, env?: NodeJS.ProcessEnv }} [options]
 * @returns {Promise<boolean>}
 */
async function isAvailable(options = {}) {
  if (cachedAvailability !== null && !options.force) return cachedAvailability;

  try {
    const { stdout, stderr } = await runGppt(['--version'], { env: options.env, timeoutMs: 15000 });
    cachedAvailability = Boolean(stdout || stderr); // gppt prints version to either stream
  } catch (error) {
    cachedAvailability = false;
  }
  return cachedAvailability;
}

/** @returns {void} */
function resetAvailabilityCache() {
  cachedAvailability = null;
}

/**
 * Spawn gppt.
 *
 * @param {string[]} args
 * @param {{ env?: NodeJS.ProcessEnv, timeoutMs?: number, inherit?: boolean }} [options]
 * @returns {Promise<{ stdout: string, stderr: string, code: number }>}
 */
function runGppt(args, options = {}) {
  const bin = (options.env && options.env[GPPT_BIN_ENV]) || process.env[GPPT_BIN_ENV] || 'gppt';
  const parts = String(bin).split(/\s+/).filter(Boolean);
  const command = parts[0];
  const commandArgs = parts.slice(1).concat(args);

  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(command, commandArgs, {
        env: { ...process.env, ...(options.env || {}) },
        stdio: options.inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      reject(
        new ProviderUnavailableError(
          `Failed to start "gppt". Install it with "pip install gppt". (${error.message})`,
          { cause: error }
        )
      );
      return;
    }

    let stdout = '';
    let stderr = '';
    const timeoutMs = options.timeoutMs || 120000;

    const timer = setTimeout(() => {
      try {
        child.kill('SIGTERM');
      } catch (error) {
        /* ignore */
      }
      reject(new ProviderUnavailableError(`"gppt ${args.join(' ')}" timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    if (child.stdout) child.stdout.on('data', (chunk) => (stdout += chunk.toString()));
    if (child.stderr) child.stderr.on('data', (chunk) => (stderr += chunk.toString()));

    child.on('error', (error) => {
      clearTimeout(timer);
      if (error.code === 'ENOENT') {
        reject(
          new ProviderUnavailableError(
            'The "gppt" command was not found. Install it with: pip install gppt',
            { cause: error }
          )
        );
      } else {
        reject(new ProviderUnavailableError(`Failed to run gppt: ${error.message}`, { cause: error }));
      }
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code: code === null ? -1 : code });
    });
  });
}

/**
 * Perform a login through gppt.
 *
 * - method 'import': read the token file gppt already produced (no subprocess).
 * - method 'e2e':    run `gppt login` (interactive) and then read the token file.
 *
 * @param {Object} options
 * @param {('import'|'e2e')} [options.method='import']
 * @param {string} [options.sourceProfile] which gppt profile to read from
 * @param {NodeJS.ProcessEnv} [options.env]
 * @returns {Promise<import('../token/token-info').TokenInfo>}
 */
async function login(options = {}) {
  const method = normalizeMethod(options.method);
  const sourceProfile = options.sourceProfile || GPPT_DEFAULT_PROFILE;

  if (method === 'e2e') {
    if (!(await isAvailable({ env: options.env }))) {
      throw new ProviderUnavailableError(
        'gppt is not available. Install it with "pip install gppt", then run "gppt configure && gppt login".',
        { provider: id }
      );
    }
    const result = await runGppt(['login'], {
      env: options.env,
      inherit: Boolean(options.inheritStdio),
      timeoutMs: options.timeout || 300000,
    });
    if (result.code !== 0) {
      throw new LoginError(
        `"gppt login" exited with code ${result.code}. Run it manually to see the failure.`,
        { provider: id, details: { exitCode: result.code } }
      );
    }
  }

  const { raw } = readGpptTokenFile(sourceProfile, options.env);
  const token = normalizeGpptToken(raw);
  token.provider = id;
  token.method = method;
  return token;
}

/**
 * Refresh a gppt-obtained token.
 *
 * The Pixiv refresh endpoint is provider-independent, so we reuse our own
 * implementation instead of shelling out to Python.
 *
 * @param {string} refreshToken
 * @param {Object} [options]
 * @returns {Promise<import('../token/token-info').TokenInfo>}
 */
async function refresh(refreshToken, options = {}) {
  const token = await refreshAccessToken(refreshToken, { ...options, provider: id });
  token.provider = id;
  return token;
}

/**
 * @param {string|undefined} method
 * @returns {'import'|'e2e'}
 */
function normalizeMethod(method) {
  if (!method) return 'import';
  const value = String(method).toLowerCase();
  if (value === 'import' || value === 'e2e') return value;
  throw new AuthError(
    `Unsupported gppt method "${method}". Expected one of: import, e2e`,
    { provider: id }
  );
}

module.exports = {
  id,
  methods,
  GPPT_DEFAULT_PROFILE,
  GPPT_CONFIG_DIR_ENV,
  GPPT_BIN_ENV,
  resolveGpptConfigDir,
  gpptTokenCandidates,
  findGpptTokenFile,
  readGpptTokenFile,
  normalizeGpptToken,
  isAvailable,
  resetAvailabilityCache,
  runGppt,
  login,
  refresh,
  normalizeMethod,
};
