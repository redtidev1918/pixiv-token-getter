/**
 * Profile preferences (NON-SECRET by design).
 *
 * A profile stores *how* to log in — provider, method, browser dir, proxy —
 * but never a password. Credentials are supplied per-login through CLI prompts,
 * environment variables (PIXIV_USERNAME / PIXIV_PASSWORD), or a caller-provided
 * resolver.
 */

const fs = require('fs');
const path = require('path');

const { ProfileError } = require('../../errors');
const {
  DEFAULT_PROFILE,
  assertValidProfileName,
  getProfileFilePath,
  getProfilesDir,
  ensurePrivateDir,
} = require('../../paths');

/** Supported provider identifiers. */
const PROVIDER_IDS = ['native', 'gppt', 'auto'];
/** Supported login methods. */
const AUTH_METHODS = ['oauth', 'browser', 'e2e', 'import'];

/**
 * @typedef {Object} Profile
 * @property {string} name
 * @property {('native'|'gppt'|'auto')} provider
 * @property {('oauth'|'browser'|'e2e'|'import')} method
 * @property {string|null} userDataDir  override for the persistent browser profile
 * @property {string|object|null} proxy explicit proxy (string URL or config)
 * @property {string|null} tokenPath    override for the token file location
 * @property {string|null} totpSecret   opt-in only; see docs (never auto-saved)
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/** Fields that may be persisted. Anything else is dropped. */
const PERSISTED_FIELDS = [
  'provider',
  'method',
  'userDataDir',
  'proxy',
  'tokenPath',
  'totpSecret',
];

/**
 * @param {string} [name]
 * @returns {Profile}
 */
function defaultProfile(name = DEFAULT_PROFILE) {
  const now = new Date().toISOString();
  return {
    name: assertValidProfileName(name),
    provider: 'native',
    method: 'oauth',
    userDataDir: null,
    proxy: null,
    tokenPath: null,
    totpSecret: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Validate and normalise a partial profile patch.
 * @param {Partial<Profile>} patch
 * @returns {Partial<Profile>}
 */
function sanitizePatch(patch) {
  const clean = {};

  if (patch.provider !== undefined) {
    if (!PROVIDER_IDS.includes(patch.provider)) {
      throw new ProfileError(
        `Unsupported provider "${patch.provider}". Expected one of: ${PROVIDER_IDS.join(', ')}`
      );
    }
    clean.provider = patch.provider;
  }

  if (patch.method !== undefined) {
    if (!AUTH_METHODS.includes(patch.method)) {
      throw new ProfileError(
        `Unsupported method "${patch.method}". Expected one of: ${AUTH_METHODS.join(', ')}`
      );
    }
    clean.method = patch.method;
  }

  for (const field of ['userDataDir', 'tokenPath']) {
    if (patch[field] !== undefined) {
      const value = patch[field];
      if (value !== null && typeof value !== 'string') {
        throw new ProfileError(`Profile field "${field}" must be a string or null`);
      }
      clean[field] = value === '' ? null : value;
    }
  }

  if (patch.proxy !== undefined) {
    const value = patch.proxy;
    if (value !== null && typeof value !== 'string' && typeof value !== 'object') {
      throw new ProfileError('Profile field "proxy" must be a URL string, config object, or null');
    }
    clean.proxy = value;
  }

  if (patch.totpSecret !== undefined) {
    // Opt-in only. Callers must pass this explicitly; nothing here saves it by default.
    if (patch.totpSecret !== null && typeof patch.totpSecret !== 'string') {
      throw new ProfileError('Profile field "totpSecret" must be a string or null');
    }
    clean.totpSecret = patch.totpSecret;
  }

  return clean;
}

/**
 * Read a profile from disk, falling back to defaults when absent.
 *
 * @param {string} [name]
 * @param {{ dir?: string, createDefault?: boolean }} [options]
 * @returns {Promise<Profile>}
 */
async function loadProfile(name = DEFAULT_PROFILE, options = {}) {
  const validName = assertValidProfileName(name);
  const filePath = options.dir
    ? path.join(options.dir, `${validName}.json`)
    : getProfileFilePath(validName);

  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return defaultProfile(validName);
    if (error.code === 'EACCES') {
      throw new ProfileError(`Cannot read profile "${validName}": permission denied`, {
        cause: error,
      });
    }
    throw new ProfileError(`Cannot read profile "${validName}": ${error.message}`, { cause: error });
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new ProfileError(`Profile "${validName}" is not valid JSON: ${filePath}`, {
      cause: error,
      details: { filePath },
    });
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new ProfileError(`Profile "${validName}" must be a JSON object: ${filePath}`, {
      details: { filePath },
    });
  }

  // Merge over defaults so old/partial files keep working (forward compatible),
  // and drop unknown keys.
  const base = defaultProfile(validName);
  const merged = { ...base };
  for (const field of PERSISTED_FIELDS) {
    if (parsed[field] !== undefined) merged[field] = parsed[field];
  }
  if (typeof parsed.createdAt === 'string') merged.createdAt = parsed.createdAt;
  merged.name = validName;

  try {
    const normalized = sanitizePatch(merged);
    return { ...merged, ...normalized, name: validName };
  } catch (error) {
    throw new ProfileError(`Profile "${validName}" has invalid fields: ${error.message}`, {
      cause: error,
      details: { filePath },
    });
  }
}

/**
 * Merge + persist a profile patch.
 *
 * @param {string} [name]
 * @param {Partial<Profile>} patch
 * @param {{ dir?: string }} [options]
 * @returns {Promise<Profile>}
 */
async function saveProfile(name = DEFAULT_PROFILE, patch = {}, options = {}) {
  const validName = assertValidProfileName(name);
  const dir = options.dir || getProfilesDir();
  const current = await loadProfile(validName, options);
  const clean = sanitizePatch(patch);

  const next = {
    ...current,
    ...clean,
    name: validName,
    updatedAt: new Date().toISOString(),
  };

  // Persist only known, non-secret-by-default fields.
  const serialisable = { name: next.name, createdAt: next.createdAt, updatedAt: next.updatedAt };
  for (const field of PERSISTED_FIELDS) {
    if (next[field] !== undefined) serialisable[field] = next[field];
  }

  ensurePrivateDir(dir);
  const filePath = path.join(dir, `${validName}.json`);
  const tmpPath = `${filePath}.tmp-${process.pid}`;
  try {
    fs.writeFileSync(tmpPath, `${JSON.stringify(serialisable, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    fs.renameSync(tmpPath, filePath);
    try {
      fs.chmodSync(filePath, 0o600);
    } catch (error) {
      /* non-POSIX */
    }
  } catch (error) {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch (cleanupError) {
      /* ignore */
    }
    throw new ProfileError(`Failed to write profile "${validName}": ${error.message}`, {
      cause: error,
      details: { filePath },
    });
  }

  return next;
}

/**
 * List profiles that have a preference file on disk.
 * @param {{ dir?: string }} [options]
 * @returns {Promise<string[]>}
 */
async function listProfiles(options = {}) {
  const dir = options.dir || getProfilesDir();
  try {
    return fs
      .readdirSync(dir)
      .filter((entry) => entry.endsWith('.json') && !entry.includes('.tmp-'))
      .map((entry) => entry.slice(0, -'.json'.length))
      .sort();
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    return [];
  }
}

/**
 * Delete a profile preference file. The token file is managed by the token store.
 * @param {string} [name]
 * @param {{ dir?: string }} [options]
 * @returns {Promise<void>}
 */
async function removeProfile(name = DEFAULT_PROFILE, options = {}) {
  const validName = assertValidProfileName(name);
  const dir = options.dir || getProfilesDir();
  const filePath = path.join(dir, `${validName}.json`);
  try {
    fs.unlinkSync(filePath);
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw new ProfileError(`Failed to remove profile "${validName}": ${error.message}`, {
      cause: error,
    });
  }
}

module.exports = {
  PROVIDER_IDS,
  AUTH_METHODS,
  PERSISTED_FIELDS,
  defaultProfile,
  sanitizePatch,
  loadProfile,
  saveProfile,
  listProfiles,
  removeProfile,
};
