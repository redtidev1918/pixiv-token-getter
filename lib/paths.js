/**
 * Path resolution for pixiv-token-getter state.
 *
 * Layout (XDG-ish):
 *
 *   $PIXIV_TOKEN_GETTER_CONFIG_DIR | $XDG_CONFIG_HOME/pixiv-token-getter | ~/.config/pixiv-token-getter
 *   ├── profiles/           <profile>.json      (non-secret preferences: provider/method/...)
 *   ├── tokens/             <profile>.token.json (secrets, 0600)
 *   └── browser/            <profile>/           (persistent Chrome profiles, 0700)
 *
 * Legacy (pre-2.4) layout kept readable for migration:
 *
 *   <config>/profile         → migrated to <config>/browser/default
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const { ProfileError } = require('./errors');

/** Env override for the whole state directory (handy for CI/tests and custom setups). */
const CONFIG_DIR_ENV = 'PIXIV_TOKEN_GETTER_CONFIG_DIR';
/** Default profile name. */
const DEFAULT_PROFILE = 'default';
/** Legacy (pre-2.4) single browser profile directory name, inside the config dir. */
const LEGACY_BROWSER_DIR_NAME = 'profile';

const PROFILE_NAME_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

/**
 * Validate a profile name.
 *
 * gppt (Python) interpolates the raw profile name into a file path, which allows
 * `../` traversal. We deliberately reject anything outside a strict allowlist.
 *
 * @param {string} profile
 * @returns {string} the validated profile name
 * @throws {ProfileError}
 */
function assertValidProfileName(profile) {
  if (typeof profile !== 'string' || profile.trim() === '') {
    throw new ProfileError('Profile name must be a non-empty string', {
      details: { profile },
    });
  }
  const name = profile.trim();
  if (name === '.' || name === '..' || !PROFILE_NAME_PATTERN.test(name)) {
    throw new ProfileError(
      `Invalid profile name "${profile}". Allowed characters: A-Z a-z 0-9 . _ - (max 64).`,
      { details: { profile } }
    );
  }
  return name;
}

/**
 * Resolve the root state directory. Recomputed on every call so tests and
 * long-lived processes can change the environment.
 * @returns {string}
 */
function getConfigDir() {
  const override = process.env[CONFIG_DIR_ENV];
  if (override && override.trim()) return path.resolve(expandHome(override.trim()));

  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg && xdg.trim() ? expandHome(xdg.trim()) : path.join(os.homedir(), '.config');
  return path.join(base, 'pixiv-token-getter');
}

/** @returns {string} directory holding profile preference files */
function getProfilesDir() {
  return path.join(getConfigDir(), 'profiles');
}

/** @returns {string} directory holding token files */
function getTokensDir() {
  return path.join(getConfigDir(), 'tokens');
}

/** @returns {string} directory holding persistent browser profiles */
function getBrowserRootDir() {
  return path.join(getConfigDir(), 'browser');
}

/**
 * @param {string} [profile='default']
 * @returns {string} persistent Chrome profile directory for a profile
 */
function getBrowserDir(profile = DEFAULT_PROFILE) {
  return path.join(getBrowserRootDir(), assertValidProfileName(profile));
}

/**
 * @param {string} [profile='default']
 * @returns {string} token file path for a profile
 */
function getTokenFilePath(profile = DEFAULT_PROFILE) {
  return path.join(getTokensDir(), `${assertValidProfileName(profile)}.token.json`);
}

/**
 * @param {string} [profile='default']
 * @returns {string} profile preference file path
 */
function getProfileFilePath(profile = DEFAULT_PROFILE) {
  return path.join(getProfilesDir(), `${assertValidProfileName(profile)}.json`);
}

/** @returns {string} legacy (pre-2.4) browser profile directory */
function getLegacyBrowserDir() {
  return path.join(getConfigDir(), LEGACY_BROWSER_DIR_NAME);
}

/**
 * Move the legacy single browser profile into the multi-profile layout so
 * upgrading does not log existing users out.
 *
 * Only runs when the legacy dir exists and the target does not.
 * Best-effort: never throws.
 *
 * @param {string} [profile='default']
 * @returns {{ migrated: boolean, from?: string, to?: string }}
 */
function migrateLegacyBrowserProfile(profile = DEFAULT_PROFILE) {
  try {
    const from = getLegacyBrowserDir();
    const to = getBrowserDir(profile);
    if (from === to) return { migrated: false };
    if (!fs.existsSync(from)) return { migrated: false };
    if (fs.existsSync(to)) return { migrated: false };

    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.renameSync(from, to);
    return { migrated: true, from, to };
  } catch (error) {
    // Cross-device rename can fail; do not block the user, they can log in again.
    return { migrated: false };
  }
}

/**
 * Ensure a private directory exists (0700 on POSIX).
 * @param {string} dir
 */
function ensurePrivateDir(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

/**
 * Expand a leading `~` (gppt notably does not do this).
 * @param {string} p
 * @returns {string}
 */
function expandHome(p) {
  if (p === '~') return os.homedir();
  if (p.startsWith('~/') || p.startsWith('~\\')) return path.join(os.homedir(), p.slice(2));
  return p;
}

module.exports = {
  CONFIG_DIR_ENV,
  DEFAULT_PROFILE,
  assertValidProfileName,
  getConfigDir,
  getProfilesDir,
  getTokensDir,
  getBrowserRootDir,
  getBrowserDir,
  getTokenFilePath,
  getProfileFilePath,
  getLegacyBrowserDir,
  migrateLegacyBrowserProfile,
  ensurePrivateDir,
  expandHome,
};
