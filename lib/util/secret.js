/**
 * Secret masking helpers.
 *
 * Secrets must never hit stdout, logs, or thrown errors by default.
 */

/** Placeholder shown when a secret exists but must not be printed. */
const MASK = '********';

/**
 * Mask a secret, keeping only a short, non-reversible-looking tail for support.
 *
 * @param {string|undefined|null} value
 * @param {{ keep?: number }} [options]
 * @returns {string} e.g. `********abcd`, or `-` when absent
 */
function maskSecret(value, options = {}) {
  if (value === undefined || value === null || value === '') return '-';
  const text = String(value);
  const keep = options.keep === undefined ? 4 : Math.max(0, options.keep);
  if (text.length <= keep) return MASK;
  return `${MASK}${text.slice(-keep)}`;
}

/**
 * True when a value looks like a real secret worth masking.
 * @param {unknown} value
 * @returns {boolean}
 */
function hasSecret(value) {
  return typeof value === 'string' && value !== '';
}

module.exports = { MASK, maskSecret, hasSecret };
