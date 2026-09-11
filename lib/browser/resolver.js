/**
 * Deterministic system-browser discovery.
 *
 * PixivFlow/pixiv-token-getter must never download a browser at install time.
 * Instead we launch whatever Chrome/Chromium the user already has, resolving
 * in a fixed order:
 *
 *   1. explicit `executablePath` option
 *   2. PUPPETEER_EXECUTABLE_PATH environment variable
 *   3. platform-known install locations
 *   4. PATH lookup for common binary names
 *   5. not found -> callers must surface the helpful error below
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

/** Binary names tried on PATH, per platform. */
const PATH_CANDIDATES = {
  linux: ['google-chrome-stable', 'google-chrome', 'chromium', 'chromium-browser', 'chrome'],
  darwin: [
    'Google Chrome',
    'Chromium',
    // Homebrew / CLI installs expose lowercase names on PATH too.
    'google-chrome-stable',
    'google-chrome',
    'chromium',
    'chrome',
  ],
  win32: ['chrome.exe', 'chromium.exe'],
};

/** Fixed install locations checked per platform. `~` is expanded. */
const KNOWN_LOCATIONS = {
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '~/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '~/Applications/Chromium.app/Contents/MacOS/Chromium',
  ],
  win32: [
    '%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe',
    '%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe',
    '%LocalAppData%\\Google\\Chrome\\Application\\chrome.exe',
    '%ProgramFiles%\\Chromium\\Application\\chrome.exe',
    '%LocalAppData%\\Chromium\\Application\\chrome.exe',
  ],
  linux: [],
};

function expandTemplate(value) {
  if (value.startsWith('~')) return path.join(os.homedir(), value.slice(1));
  return value.replace(/%([^%]+)%/g, (_, name) => process.env[name] || '');
}

function isExecutableFile(candidate) {
  try {
    fs.accessSync(candidate, fs.constants.X_OK);
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

/** Search every PATH directory for one of the candidate names. */
function lookupOnPath(candidates) {
  const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  for (const dir of dirs) {
    for (const name of candidates) {
      const full = path.join(dir, name);
      if (isExecutableFile(full)) return full;
    }
  }
  return null;
}

/**
 * Resolve a usable browser executable.
 *
 * @param {{ executablePath?: string }} [options]
 * @returns {string|null} absolute path, or null when nothing was found
 */
function findBrowserExecutable(options = {}) {
  const explicit = options.executablePath || process.env.PUPPETEER_EXECUTABLE_PATH || '';
  if (explicit) {
    return isExecutableFile(explicit) ? path.resolve(explicit) : null;
  }

  const platform = process.platform;
  for (const template of KNOWN_LOCATIONS[platform] || []) {
    const full = expandTemplate(template);
    if (isExecutableFile(full)) return full;
  }

  return lookupOnPath(PATH_CANDIDATES[platform] || PATH_CANDIDATES.linux);
}

/** User-facing guidance shown when no browser can be located. */
function browserNotFoundMessage() {
  return [
    'No compatible Chrome/Chromium installation was found.',
    '',
    'Install Chrome/Chromium, or point the launcher at an existing browser:',
    '',
    '  PUPPETEER_EXECUTABLE_PATH=/path/to/chrome-or-chromium',
    '',
    '(On Windows: set PUPPETEER_EXECUTABLE_PATH to chrome.exe, e.g.',
    ' C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe)',
  ].join('\n');
}

module.exports = {
  findBrowserExecutable,
  browserNotFoundMessage,
  // exported for tests
  PATH_CANDIDATES,
  KNOWN_LOCATIONS,
};
