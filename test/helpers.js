/**
 * Shared test fixture helpers. No real Pixiv/network/browser access.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * Create an isolated state directory and point the library at it.
 * @returns {{ dir: string, cleanup: () => void }}
 */
function useTempConfigDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ptg-test-'));
  const previous = process.env.PIXIV_TOKEN_GETTER_CONFIG_DIR;
  process.env.PIXIV_TOKEN_GETTER_CONFIG_DIR = dir;

  return {
    dir,
    cleanup() {
      if (previous === undefined) delete process.env.PIXIV_TOKEN_GETTER_CONFIG_DIR;
      else process.env.PIXIV_TOKEN_GETTER_CONFIG_DIR = previous;
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

/**
 * A raw token-endpoint response.
 * @param {Partial<object>} [overrides]
 * @returns {object}
 */
function rawTokenResponse(overrides = {}) {
  return {
    access_token: 'access-AAA',
    refresh_token: 'refresh-RRR',
    expires_in: 3600,
    token_type: 'bearer',
    scope: '',
    user: { id: '12345', name: 'tester', account: 'tester_account' },
    ...overrides,
  };
}

/**
 * Build an injectable HTTP transport that always succeeds with `data`.
 * @param {object} data
 * @returns {(req: any) => Promise<{ status: number, data: object }>}
 */
function okTransport(data = rawTokenResponse()) {
  const calls = [];
  const transport = async (req) => {
    calls.push(req);
    return { status: 200, data };
  };
  transport.calls = calls;
  return transport;
}

/**
 * Build a transport that fails with an HTTP status + body.
 * @param {number} status
 * @param {object} [body]
 * @returns {(req: any) => Promise<never>}
 */
function failingTransport(status, body = { error: 'invalid_grant' }) {
  const transport = async () => {
    const error = new Error(`HTTP ${status}`);
    error.httpStatus = status;
    error.responseBody = body;
    throw error;
  };
  return transport;
}

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { useTempConfigDir, rawTokenResponse, okTransport, failingTransport, sleep };
