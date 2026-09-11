/**
 * Minimal RFC 6238 TOTP generator (opt-in second-factor support).
 *
 * Only used when a caller/profile EXPLICITLY provides a TOTP secret. Nothing
 * here is enabled by default and no secret is ever logged.
 */

const crypto = require('crypto');

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Decode an RFC 4648 base32 string (case-insensitive, padding tolerated).
 * @param {string} input
 * @returns {Buffer}
 */
function base32Decode(input) {
  const cleaned = String(input).toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  if (cleaned === '') return Buffer.alloc(0);

  let bits = 0;
  let value = 0;
  const output = [];

  for (const char of cleaned) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) throw new Error(`Invalid base32 character "${char}"`);
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

/**
 * Generate a 6-digit TOTP code.
 * @param {string} secret base32 secret (or otpauth:// URI)
 * @param {{ time?: number, step?: number, digits?: number }} [options]
 * @returns {string}
 */
function generateTotp(secret, options = {}) {
  const step = options.step || 30;
  const digits = options.digits || 6;
  const time = options.time === undefined ? Date.now() : options.time;

  const base32 = extractSecret(secret);
  const counter = Math.floor(time / 1000 / step);

  const buffer = Buffer.alloc(8);
  buffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buffer.writeUInt32BE(counter % 0x100000000, 4);

  const hmac = crypto.createHmac('sha1', base32Decode(base32)).update(buffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return String(binary % 10 ** digits).padStart(digits, '0');
}

/**
 * Accept either a raw base32 secret or an `otpauth://` URI.
 * @param {string} secret
 * @returns {string}
 */
function extractSecret(secret) {
  const value = String(secret || '').trim();
  if (!value) throw new Error('TOTP secret is empty');
  if (!value.toLowerCase().startsWith('otpauth://')) return value;
  try {
    const url = new URL(value);
    const param = url.searchParams.get('secret');
    if (!param) throw new Error('otpauth URI has no secret parameter');
    return param;
  } catch (error) {
    throw new Error(`Invalid otpauth URI: ${error.message}`);
  }
}

module.exports = { base32Decode, generateTotp, extractSecret };
