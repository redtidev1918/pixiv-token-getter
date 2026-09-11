const test = require('node:test');
const assert = require('node:assert/strict');

const { collectWebCookies, WEB_COOKIE_NAMES } = require('../lib/browser/cookies');

/**
 * Minimal Puppeteer-shaped browser stub.
 * @param {Array<Array<{ name: string, value: string }>>} jars
 */
function fakeBrowser(jars) {
  return {
    async pages() {
      return jars.map((jar) => ({ async cookies() { return jar; } }));
    },
  };
}

test('PHPSESSID is captured from the browser session', async () => {
  const browser = fakeBrowser([[{ name: 'PHPSESSID', value: 'sess-123' }]]);
  const cookies = await collectWebCookies(browser);
  assert.deepEqual(cookies, { PHPSESSID: 'sess-123' });
  assert.deepEqual(WEB_COOKIE_NAMES, ['PHPSESSID']);
});

test('uninteresting cookies and empty values are ignored', async () => {
  const browser = fakeBrowser([
    [
      { name: 'PHPSESSID', value: '' },
      { name: 'cf_clearance', value: 'nope' },
    ],
    [{ name: 'PHPSESSID', value: 'from-second-page' }],
  ]);
  const cookies = await collectWebCookies(browser);
  assert.deepEqual(cookies, { PHPSESSID: 'from-second-page' });
});

test('cookie collection is best-effort and never throws', async () => {
  const broken = {
    async pages() {
      throw new Error('browser gone');
    },
  };
  assert.deepEqual(await collectWebCookies(broken), {});
  assert.deepEqual(await collectWebCookies(null), {});

  const pageThrows = {
    async pages() {
      return [
        {
          async cookies() {
            throw new Error('no cookies');
          },
        },
      ];
    },
  };
  assert.deepEqual(await collectWebCookies(pageThrows), {});
});

test('custom cookie names can be requested', async () => {
  const browser = fakeBrowser([[{ name: 'custom', value: 'v' }]]);
  assert.deepEqual(await collectWebCookies(browser, { names: ['custom'] }), { custom: 'v' });
});
