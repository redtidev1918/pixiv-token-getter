/**
 * Web-session cookie collection.
 *
 * IMPORTANT distinction (see README):
 *  - an OAuth access token is for the Pixiv **App API**;
 *  - a web cookie such as PHPSESSID is for the Pixiv **website/session**.
 * They are not interchangeable, and only a real browser login can produce the
 * latter — the gppt provider therefore never fabricates `web_cookies`.
 */

/** Cookie names worth carrying downstream. */
const WEB_COOKIE_NAMES = ['PHPSESSID'];

/** Origins the Pixiv web session cookies live on. */
const COOKIE_ORIGINS = ['https://www.pixiv.net/', 'https://pixiv.net/'];

/**
 * Read web-session cookies from an open browser.
 * Best-effort: never throws; returns an object keyed by cookie name.
 *
 * @param {import('puppeteer').Browser} browser
 * @param {{ names?: string[] }} [options]
 * @returns {Promise<Record<string,string>>}
 */
async function collectWebCookies(browser, options = {}) {
  const names = options.names || WEB_COOKIE_NAMES;
  const cookies = {};
  if (!browser) return cookies;

  try {
    const pages = await browser.pages();
    for (const page of pages) {
      let jar = [];
      try {
        jar = await page.cookies(...COOKIE_ORIGINS);
      } catch (error) {
        continue;
      }
      for (const cookie of jar) {
        if (names.includes(cookie.name) && cookie.value) {
          cookies[cookie.name] = cookie.value;
        }
      }
    }
  } catch (error) {
    // best effort
  }
  return cookies;
}

module.exports = { WEB_COOKIE_NAMES, COOKIE_ORIGINS, collectWebCookies };
