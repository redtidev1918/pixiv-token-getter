/**
 * Token persistence.
 *
 * The default implementation (`FileTokenStore`) writes atomically:
 *
 *   write temp (0600) → fsync → rename over target → chmod 0600
 *
 * A crash or a failed refresh therefore NEVER truncates an existing token file
 * and never replaces a good token with a bad one.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { TokenStoreError } = require('../../errors');
const { getTokenFilePath, getTokensDir, ensurePrivateDir, assertValidProfileName } = require('../../paths');
const { isTokenInfoShape } = require('./token-info');

/** File mode for token files (owner read/write only). */
const TOKEN_FILE_MODE = 0o600;
/** Directory mode for state directories. */
const STATE_DIR_MODE = 0o700;

/**
 * @typedef {Object} TokenStore
 * @property {(profile: string) => Promise<import('./token-info').TokenInfo|null>} load
 * @property {(profile: string, token: import('./token-info').TokenInfo) => Promise<void>} save
 * @property {(profile: string) => Promise<void>} remove
 * @property {(profile: string) => string} [pathFor]
 * @property {() => Promise<string[]>} [list]
 */

/**
 * Atomically write `content` to `filePath`.
 *
 * @param {string} filePath
 * @param {string} content
 * @param {{ mode?: number, dirMode?: number }} [options]
 */
function writeFileAtomic(filePath, content, options = {}) {
  const mode = options.mode === undefined ? TOKEN_FILE_MODE : options.mode;
  const dirMode = options.dirMode === undefined ? STATE_DIR_MODE : options.dirMode;
  const dir = path.dirname(filePath);

  try {
    fs.mkdirSync(dir, { recursive: true, mode: dirMode });
  } catch (error) {
    throw new TokenStoreError(`Cannot create token directory ${dir}: ${error.message}`, {
      cause: error,
      details: { dir },
    });
  }

  const tmpPath = `${filePath}.tmp-${process.pid}-${crypto.randomBytes(6).toString('hex')}`;
  let fd;

  try {
    fd = fs.openSync(tmpPath, 'w', mode);
    fs.writeFileSync(fd, content, { encoding: 'utf8' });
    // Flush to disk so a crash right after rename cannot leave an empty file.
    try {
      fs.fsyncSync(fd);
    } catch (error) {
      // fsync is unsupported on some filesystems; the rename is still atomic.
    }
    fs.closeSync(fd);
    fd = undefined;

    // Atomic replace. On POSIX, rename() over an existing file is atomic.
    fs.renameSync(tmpPath, filePath);

    // Best-effort permission tightening (temp file was already created with
    // `mode`, but umask can strip bits on some platforms).
    try {
      fs.chmodSync(filePath, mode);
    } catch (error) {
      // Non-POSIX platform (Windows): documented limitation.
    }
    return filePath;
  } catch (error) {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch (closeError) {
        /* ignore */
      }
    }
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch (cleanupError) {
      /* ignore */
    }
    if (error instanceof TokenStoreError) throw error;
    throw new TokenStoreError(`Failed to write token file ${filePath}: ${error.message}`, {
      cause: error,
      details: { filePath },
    });
  }
}

/**
 * Serialise a token for storage.
 * @param {import('./token-info').TokenInfo} token
 * @returns {string}
 */
function serializeToken(token) {
  return `${JSON.stringify(token, null, 2)}\n`;
}

/**
 * Parse a stored token, returning null when the file is missing or unusable.
 * Fail-soft by design: a corrupt cache must lead to re-login, not a crash.
 * @param {string} content
 * @returns {import('./token-info').TokenInfo|null}
 */
function parseToken(content) {
  try {
    const parsed = JSON.parse(content);
    return isTokenInfoShape(parsed) ? parsed : null;
  } catch (error) {
    return null;
  }
}

/**
 * File-backed token store.
 */
class FileTokenStore {
  /**
   * @param {{ dir?: string }} [options]
   */
  constructor(options = {}) {
    this.dir = options.dir || getTokensDir();
    /** @type {TokenStore} */
    this._self = this;
  }

  /**
   * @param {string} profile
   * @returns {string}
   */
  pathFor(profile) {
    const name = assertValidProfileName(profile);
    // When a custom dir is injected, ignore the global layout.
    if (this.dir === getTokensDir()) return getTokenFilePath(name);
    return path.join(this.dir, `${name}.token.json`);
  }

  /**
   * @param {string} profile
   * @returns {Promise<import('./token-info').TokenInfo|null>}
   */
  async load(profile) {
    const filePath = this.pathFor(profile);
    let content;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      // Unreadable (permissions, IO): treat as missing rather than crashing.
      return null;
    }
    return parseToken(content);
  }

  /**
   * @param {string} profile
   * @param {import('./token-info').TokenInfo} token
   * @returns {Promise<void>}
   */
  async save(profile, token) {
    const filePath = this.pathFor(profile);
    if (!isTokenInfoShape(token)) {
      throw new TokenStoreError('Refusing to save a token without access_token', {
        details: { profile },
      });
    }
    ensurePrivateDir(this.dir);
    writeFileAtomic(filePath, serializeToken(token), { mode: TOKEN_FILE_MODE });
  }

  /**
   * @param {string} profile
   * @returns {Promise<void>}
   */
  async remove(profile) {
    const filePath = this.pathFor(profile);
    try {
      fs.unlinkSync(filePath);
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw new TokenStoreError(`Failed to remove token file ${filePath}: ${error.message}`, {
        cause: error,
        details: { filePath },
      });
    }
  }

  /**
   * @returns {Promise<string[]>} profile names that currently have a token
   */
  async list() {
    try {
      return fs
        .readdirSync(this.dir)
        .filter((entry) => entry.endsWith('.token.json'))
        .map((entry) => entry.slice(0, -'.token.json'.length));
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      return [];
    }
  }
}

/**
 * In-memory store, mainly for tests and ephemeral consumers.
 */
class MemoryTokenStore {
  constructor() {
    /** @type {Map<string, import('./token-info').TokenInfo>} */
    this.tokens = new Map();
  }

  /** @param {string} profile */
  pathFor(profile) {
    return `memory:${assertValidProfileName(profile)}`;
  }

  /** @param {string} profile */
  async load(profile) {
    return this.tokens.get(assertValidProfileName(profile)) || null;
  }

  /** @param {string} profile @param {import('./token-info').TokenInfo} token */
  async save(profile, token) {
    if (!isTokenInfoShape(token)) {
      throw new TokenStoreError('Refusing to save a token without access_token');
    }
    this.tokens.set(assertValidProfileName(profile), JSON.parse(JSON.stringify(token)));
  }

  /** @param {string} profile */
  async remove(profile) {
    this.tokens.delete(assertValidProfileName(profile));
  }

  async list() {
    return [...this.tokens.keys()];
  }
}

module.exports = {
  TOKEN_FILE_MODE,
  STATE_DIR_MODE,
  writeFileAtomic,
  serializeToken,
  parseToken,
  FileTokenStore,
  MemoryTokenStore,
};
