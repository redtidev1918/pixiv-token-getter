/**
 * Wait for the OAuth redirect that carries the authorization code (or error).
 *
 * Takes a page-like object, so it can be unit tested with a fake page.
 */

const { parseCallbackUrl } = require('../auth/oauth/pkce');

/** Poll interval (ms) used as a safety net for missed browser events. */
const POLL_INTERVAL_MS = 1000;

/**
 * @param {import('puppeteer').Page} page
 * @param {number} timeoutMs
 * @returns {Promise<{ code: string|null, error: string|null, timedOut: boolean }>}
 */
function waitForAuthCode(page, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    let timeout;
    let pollInterval;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      clearInterval(pollInterval);
      try {
        page.off('response', onResponse);
        page.off('framenavigated', onFrameNavigated);
      } catch (error) {
        /* ignore cleanup errors */
      }
      resolve(result);
    };

    const check = (url) => parseCallbackUrl(url);

    timeout = setTimeout(
      () => finish({ code: null, error: null, timedOut: true }),
      timeoutMs
    );

    pollInterval = setInterval(() => {
      const result = check(page.url());
      if (result) finish({ code: result.code, error: result.error, timedOut: false });
    }, POLL_INTERVAL_MS);

    const onResponse = (response) => {
      const result = check(response.url());
      if (result) finish({ code: result.code, error: result.error, timedOut: false });
    };

    const onFrameNavigated = (frame) => {
      try {
        if (frame !== page.mainFrame()) return;
        const result = check(frame.url());
        if (result) finish({ code: result.code, error: result.error, timedOut: false });
      } catch (error) {
        /* ignore */
      }
    };

    const immediate = check(page.url());
    if (immediate) {
      finish({ code: immediate.code, error: immediate.error, timedOut: false });
      return;
    }

    page.on('response', onResponse);
    page.on('framenavigated', onFrameNavigated);
  });
}

module.exports = { waitForAuthCode, POLL_INTERVAL_MS };
