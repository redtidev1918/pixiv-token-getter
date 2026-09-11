/**
 * Puppeteer browser plumbing (launch + login page).
 *
 * `puppeteer-core` is required lazily so that `ptg --help` / `ptg --version`
 * and non-browser paths keep working even when the browser dependency is
 * absent. No browser is ever downloaded at install time: the executable comes
 * from the system (see ./resolver) or an explicit override.
 */

const fs = require('fs');

const { AuthError, LoginError } = require('../errors');
const { BROWSER_USER_AGENT } = require('../auth/oauth/constants');
const { getBrowserDir, migrateLegacyBrowserProfile } = require('../paths');
const { toPuppeteerProxyServer, toPuppeteerAuth } = require('../auth/proxy/proxy');
const { findBrowserExecutable, browserNotFoundMessage } = require('./resolver');

/** Common Chrome flags for a clean, automation-resistant browser. */
const BROWSER_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-blink-features=AutomationControlled',
  '--disable-dev-shm-usage',
  '--disable-accelerated-2d-canvas',
  '--no-first-run',
  '--disable-gpu',
];

/**
 * Is Puppeteer resolvable?
 * @returns {Promise<boolean>}
 */
async function isPuppeteerAvailable() {
  try {
    require.resolve('puppeteer-core');
  } catch (error) {
    return false;
  }
  return findBrowserExecutable() !== null;
}

/**
 * The default persistent browser profile directory.
 * Kept as a getter-friendly function; `DEFAULT_USER_DATA_DIR` is exposed below
 * for backward compatibility.
 * @returns {string}
 */
function getDefaultUserDataDir(profile) {
  return getBrowserDir(profile || 'default');
}

/**
 * Launch a configured Puppeteer browser.
 *
 * @param {Object} [options]
 * @param {boolean} [options.headless=false]
 * @param {string} [options.userDataDir] persistent profile dir; '' / false → ephemeral
 * @param {string} [options.executablePath] explicit browser executable; overrides the resolver
 * @param {import('../auth/proxy/proxy').ProxyConfig|null} [options.proxy]
 * @param {string} [options.profile] which profile dir to migrate/use
 * @returns {Promise<import('puppeteer-core').Browser>}
 */
async function launchBrowser(options = {}) {
  const { headless = false, proxy = null, profile = 'default' } = options;
  const userDataDir =
    options.userDataDir === undefined ? getDefaultUserDataDir(profile) : options.userDataDir;

  let puppeteer;
  try {
    puppeteer = require('puppeteer-core');
  } catch (error) {
    throw new AuthError(
      'puppeteer-core is not installed. Install it with: npm install puppeteer-core',
      { cause: error }
    );
  }

  // Never download a browser: launch the one the user already has.
  const executablePath = options.executablePath || findBrowserExecutable();
  if (!executablePath) {
    throw new LoginError(browserNotFoundMessage());
  }

  const args = BROWSER_ARGS.concat(headless ? ['--no-zygote'] : []);
  if (proxy && proxy.url) {
    args.push(`--proxy-server=${toPuppeteerProxyServer(proxy)}`);
  }

  const launchOptions = {
    headless: Boolean(headless),
    args,
    ignoreHTTPSErrors: true,
    executablePath,
  };

  if (userDataDir) {
    // Upgrading from the pre-2.4 layout must not log the user out.
    migrateLegacyBrowserProfile(profile);
    try {
      fs.mkdirSync(userDataDir, { recursive: true, mode: 0o700 });
      launchOptions.userDataDir = userDataDir;
    } catch (error) {
      // Persistent profile unavailable → fall back to an ephemeral one.
    }
  }

  try {
    return await puppeteer.launch(launchOptions);
  } catch (error) {
    throw new LoginError(`Failed to launch browser: ${error.message}`, { cause: error });
  }
}

/**
 * Open the Pixiv login page with a realistic UA and headers.
 *
 * @param {import('puppeteer').Browser} browser
 * @param {string} loginUrl
 * @param {{ proxy?: import('../auth/proxy/proxy').ProxyConfig|null, timeout?: number }} [options]
 * @returns {Promise<import('puppeteer').Page>}
 */
async function openLoginPage(browser, loginUrl, options = {}) {
  const timeout = options.timeout || 60000;
  const page = await browser.newPage();
  await page.setUserAgent(BROWSER_USER_AGENT);
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });

  if (options.proxy) {
    const auth = toPuppeteerAuth(options.proxy);
    if (auth) {
      try {
        await page.authenticate(auth);
      } catch (error) {
        /* best effort */
      }
    }
  }

  try {
    await page.goto(loginUrl, { waitUntil: 'networkidle2', timeout });
  } catch (error) {
    await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout });
  }
  return page;
}

module.exports = {
  BROWSER_ARGS,
  isPuppeteerAvailable,
  getDefaultUserDataDir,
  launchBrowser,
  openLoginPage,
};

// Backward-compatible constant. Resolved lazily so env overrides work.
Object.defineProperty(module.exports, 'DEFAULT_USER_DATA_DIR', {
  enumerable: true,
  get() {
    return getDefaultUserDataDir('default');
  },
});
