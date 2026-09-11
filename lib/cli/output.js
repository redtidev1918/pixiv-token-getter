/**
 * CLI output formatting.
 *
 * Hard rule: secret values are NEVER printed unless the user explicitly passes
 * `--show-secret`. Masked previews keep support workflows possible without
 * leaking anything into terminals, logs, or CI output.
 */

const fs = require('fs');
const path = require('path');

const { maskSecret, MASK } = require('../util/secret');
const { writeFileAtomic, TOKEN_FILE_MODE } = require('../auth/token/store');
const { msUntilExpiry } = require('../auth/token/token-info');
const { describeProxy } = require('../auth/proxy/proxy');

/**
 * @param {string} line
 * @returns {void}
 */
function print(line = '') {
  process.stdout.write(`${line}\n`);
}

/**
 * @param {string} line
 * @returns {void}
 */
function printError(line) {
  process.stderr.write(`${line}\n`);
}

/**
 * Human-readable remaining lifetime.
 * @param {number|null} ms
 * @returns {string}
 */
function formatDuration(ms) {
  if (ms === null || ms === undefined) return 'unknown';
  if (ms <= 0) return 'expired';
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (totalMinutes > 0) return `${totalMinutes}m`;
  return `${Math.floor(ms / 1000)}s`;
}

/**
 * Describe a token, masking secrets unless explicitly allowed.
 *
 * @param {import('../auth/token/token-info').TokenInfo} token
 * @param {{ showSecret?: boolean }} [options]
 * @returns {string[]}
 */
function formatToken(token, options = {}) {
  const show = Boolean(options.showSecret);
  const remaining = msUntilExpiry(token);
  const lines = [];

  lines.push(`Profile:        ${token.profile || '-'}`);
  lines.push(`Provider:       ${token.provider || '-'}${token.method ? ` (${token.method})` : ''}`);
  if (token.user) {
    const name = token.user.name || token.user.account || '-';
    const id = token.user.id ? ` (ID: ${token.user.id})` : '';
    lines.push(`User:           ${name}${id}`);
  }
  lines.push(`Access token:   ${show ? token.access_token : maskSecret(token.access_token)}`);
  lines.push(
    `Refresh token:  ${show ? token.refresh_token : maskSecret(token.refresh_token)}`
  );
  lines.push(`Expires at:     ${token.expires_at || 'unknown'} (in ${formatDuration(remaining)})`);

  const cookieNames = token.web_cookies ? Object.keys(token.web_cookies) : [];
  lines.push(
    `Web session:    ${cookieNames.length ? `${cookieNames.join(', ')} available` : 'not available'}`
  );
  return lines;
}

/**
 * Format `status()` output for humans. Never contains secret values.
 * @param {any} info
 * @returns {string[]}
 */
function formatStatus(info) {
  const lines = [];
  const remaining = info.accessToken && info.accessToken.msUntilExpiry;

  lines.push(`Profile:        ${info.profile}`);
  lines.push(`Provider:       ${info.provider}${info.method ? ` (${info.method})` : ''}`);

  if (info.user) {
    const name = info.user.name || info.user.account || '-';
    const id = info.user.id ? ` (ID: ${info.user.id})` : '';
    lines.push(`User:           ${name}${id}`);
  } else {
    lines.push('User:           -');
  }

  if (!info.hasToken) {
    lines.push('Access token:   missing');
    lines.push('Refresh token:  missing');
  } else {
    lines.push(
      `Access token:   ${info.accessToken.valid ? 'valid' : 'expired'}${
        info.accessToken.expiresAt ? ` (expires ${info.accessToken.expiresAt})` : ''
      }`
    );
    if (remaining !== null && remaining !== undefined) {
      lines.push(`Expires in:     ${formatDuration(remaining)}`);
    }
    lines.push(`Refresh token:  ${info.refreshToken.present ? 'present' : 'missing'}`);
  }

  lines.push(
    `Web session:    ${
      info.webSession.present ? `${info.webSession.cookies.join(', ')} available` : 'not available'
    }`
  );
  if (info.lastRefreshedAt) lines.push(`Last refresh:   ${info.lastRefreshedAt}`);
  if (info.obtainedAt) lines.push(`Obtained at:    ${info.obtainedAt}`);
  if (info.tokenFile) lines.push(`Token file:     ${info.tokenFile}`);
  if (info.browserDir) lines.push(`Browser dir:    ${info.browserDir}`);

  return lines;
}

/**
 * Mask a token object for `--json` output.
 * @param {object} token
 * @param {boolean} showSecret
 * @returns {object}
 */
function maskTokenForJson(token, showSecret) {
  if (showSecret) return token;
  const clone = { ...token };
  if (clone.access_token) clone.access_token = maskSecret(clone.access_token);
  if (clone.refresh_token) clone.refresh_token = maskSecret(clone.refresh_token);
  if (clone.web_cookies) {
    clone.web_cookies = Object.fromEntries(
      Object.entries(clone.web_cookies).map(([name, value]) => [name, maskSecret(value)])
    );
  }
  return clone;
}

/**
 * Write a legacy-format token file (0600, atomic).
 *
 * Kept byte-compatible with the pre-2.4 CLI output shape so existing pipelines
 * that read `pixiv-token.json` keep working.
 *
 * @param {import('../auth/token/token-info').TokenInfo} tokenInfo
 * @param {string} outputPath
 * @returns {string} the absolute path written
 */
function saveTokenToFile(tokenInfo, outputPath) {
  const obtainedAt = tokenInfo.obtained_at ? new Date(tokenInfo.obtained_at) : new Date();
  const output = {
    access_token: tokenInfo.access_token,
    refresh_token: tokenInfo.refresh_token,
    expires_in: tokenInfo.expires_in,
    expires_at: tokenInfo.expires_at
      ? tokenInfo.expires_at
      : tokenInfo.expires_in
        ? new Date(obtainedAt.getTime() + tokenInfo.expires_in * 1000).toISOString()
        : null,
    token_type: tokenInfo.token_type,
    scope: tokenInfo.scope,
    user: tokenInfo.user,
    ...(tokenInfo.web_cookies && Object.keys(tokenInfo.web_cookies).length
      ? { web_cookies: tokenInfo.web_cookies }
      : {}),
    obtained_at: obtainedAt.toISOString(),
  };

  const absolute = path.resolve(process.cwd(), outputPath);
  writeFileAtomic(absolute, `${JSON.stringify(output, null, 2)}\n`, { mode: TOKEN_FILE_MODE });
  print(`[+] Token saved to: ${absolute} (permissions 0600)`);
  return absolute;
}

module.exports = {
  MASK,
  print,
  printError,
  formatDuration,
  formatToken,
  formatStatus,
  maskTokenForJson,
  saveTokenToFile,
  describeProxy,
  maskSecret,
};
