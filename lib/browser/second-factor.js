/**
 * Two-factor (TOTP) handling for the automated browser login.
 *
 * No TOTP secret is persisted by default. A caller must explicitly supply
 * `totpCode`, `totpPrompt`, or `totpSecret`; otherwise we fail with a precise,
 * actionable error instead of hanging until timeout.
 */

const { TwoFactorRequiredError } = require('../errors');
const { generateTotp } = require('../auth/oauth/totp');

/** Selectors that indicate Pixiv is asking for a one-time code. */
const SECOND_FACTOR_SELECTORS = [
  'input[autocomplete="one-time-code"]',
  'input[name="otp"]',
  'input[name="code"]',
  'input[inputmode="numeric"]',
  '#LoginComponent input[type="tel"]',
  '#LoginComponent input[type="text"][maxlength="6"]',
];

/** How long we watch for a second-factor prompt after submitting credentials. */
const SECOND_FACTOR_WATCH_MS = 15000;

/**
 * Resolve a code from whichever source the caller provided.
 *
 * @param {Object} options
 * @param {string} [options.totpCode]
 * @param {string} [options.totpSecret] explicit opt-in only
 * @param {() => Promise<string>} [options.totpPrompt]
 * @returns {Promise<string>}
 */
async function resolveSecondFactorCode(options = {}) {
  if (options.totpSecret) return generateTotp(options.totpSecret);
  if (options.totpCode) return String(options.totpCode);
  if (typeof options.totpPrompt === 'function') {
    const code = await options.totpPrompt();
    if (!code) {
      throw new TwoFactorRequiredError('totpPrompt() returned an empty code');
    }
    return String(code);
  }
  throw new TwoFactorRequiredError(
    'Pixiv requested a two-factor code but no totpCode / totpPrompt / totpSecret was supplied.'
  );
}

/**
 * Find the visible one-time-code input, if any.
 * @param {import('puppeteer').Page} page
 * @returns {Promise<import('puppeteer').ElementHandle|null>}
 */
async function findSecondFactorField(page) {
  for (const selector of SECOND_FACTOR_SELECTORS) {
    try {
      const handle = await page.$(selector);
      if (handle) return handle;
    } catch (error) {
      /* try next selector */
    }
  }
  return null;
}

/**
 * Type and submit the second factor.
 * @param {import('puppeteer').Page} page
 * @param {import('puppeteer').ElementHandle} field
 * @param {string} code
 */
async function submitSecondFactor(page, field, code) {
  try {
    await field.click({ clickCount: 3 });
  } catch (error) {
    /* ignore */
  }
  await field.type(code, { delay: 80 });

  for (const selector of ['button[type="submit"]', 'input[type="submit"]', 'button']) {
    try {
      const button = await page.$(selector);
      if (button) {
        await button.click();
        return;
      }
    } catch (error) {
      /* try next */
    }
  }
  await field.press('Enter');
}

module.exports = {
  SECOND_FACTOR_SELECTORS,
  SECOND_FACTOR_WATCH_MS,
  resolveSecondFactorCode,
  findSecondFactorField,
  submitSecondFactor,
};
