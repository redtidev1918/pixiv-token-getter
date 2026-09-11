/**
 * Central proxy resolver.
 *
 * Both the token endpoint (axios) and the browser (Puppeteer) MUST resolve the
 * proxy through this module, otherwise we end up with the classic bug where the
 * browser uses a proxy but the token exchange does not (or vice versa).
 *
 * Precedence: explicit option > ALL_PROXY > HTTPS_PROXY > HTTP_PROXY
 * (each checked in both upper- and lower-case form, matching gppt's behaviour).
 */

const { AuthError } = require('../../errors');

/**
 * @typedef {Object} ProxyConfig
 * @property {string} url            full proxy URL (password redacted in logs)
 * @property {string} protocol       e.g. 'http:' or 'socks:'
 * @property {string} host
 * @property {number|undefined} port
 * @property {string|undefined} username
 * @property {string|undefined} password
 * @property {'option'|'env'} source
 */

/**
 * @param {string} value
 * @returns {string|undefined}
 */
function envValue(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

/**
 * Pick a proxy URL from the environment.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string|null}
 */
function proxyUrlFromEnv(env = process.env) {
  return (
    envValue(env.ALL_PROXY) ||
    envValue(env.all_proxy) ||
    envValue(env.HTTPS_PROXY) ||
    envValue(env.https_proxy) ||
    envValue(env.HTTP_PROXY) ||
    envValue(env.http_proxy) ||
    null
  );
}

/**
 * Parse a proxy URL into a normalised config.
 * @param {string} url
 * @param {'option'|'env'} source
 * @returns {ProxyConfig}
 * @throws {AuthError} when the URL is malformed
 */
function parseProxyUrl(url, source) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch (error) {
    throw new AuthError(`Invalid proxy URL: ${redactProxyUrl(url)}`, {
      details: { source },
      cause: error,
    });
  }
  if (!parsed.hostname) {
    throw new AuthError(`Invalid proxy URL (missing host): ${redactProxyUrl(url)}`, {
      details: { source },
    });
  }

  const protocol = normalizeProtocol(parsed.protocol);
  const port = parsed.port ? Number(parsed.port) : defaultPortFor(protocol);

  return {
    url,
    protocol,
    host: parsed.hostname,
    port,
    username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    source,
  };
}

/**
 * @param {string} protocol
 * @returns {string}
 */
function normalizeProtocol(protocol) {
  if (!protocol) return 'http:';
  const p = protocol.endsWith(':') ? protocol : `${protocol}:`;
  if (p === 'socks4:' || p === 'socks5:' || p === 'socks:') return 'socks:';
  return p;
}

/**
 * @param {string} protocol
 * @returns {number|undefined}
 */
function defaultPortFor(protocol) {
  if (protocol === 'https:') return 443;
  if (protocol === 'http:') return 80;
  if (protocol === 'socks:') return 1080;
  return undefined;
}

/**
 * Resolve the effective proxy for a call.
 *
 * @param {ProxyConfig|string|false|null|undefined} explicit
 *   - object/string: use it
 *   - `false`: explicitly disable proxying (ignore env)
 *   - null/undefined: fall back to environment
 * @param {{ env?: NodeJS.ProcessEnv }} [options]
 * @returns {ProxyConfig|null} null means "no proxy" (and axios env detection is disabled)
 */
function resolveProxy(explicit, options = {}) {
  if (explicit === false) return null;

  if (explicit && typeof explicit === 'object') {
    if (!explicit.url) {
      throw new AuthError('Proxy object must contain a "url" field');
    }
    return { ...parseProxyUrl(explicit.url, 'option'), ...explicit, source: 'option' };
  }

  if (typeof explicit === 'string') {
    return explicit.trim() ? parseProxyUrl(explicit.trim(), 'option') : null;
  }

  const envUrl = proxyUrlFromEnv(options.env || process.env);
  return envUrl ? parseProxyUrl(envUrl, 'env') : null;
}

/**
 * Redact the password portion of a proxy URL so it is safe to log.
 * @param {string|undefined|null} url
 * @returns {string}
 */
function redactProxyUrl(url) {
  if (!url) return '';
  return String(url).replace(/\/\/([^/@:]+):([^/@]*)@/, '//$1:***@');
}

/**
 * Human-readable, secret-free description of a proxy.
 * @param {ProxyConfig|null|undefined} proxy
 * @returns {string|null}
 */
function describeProxy(proxy) {
  if (!proxy) return null;
  return redactProxyUrl(proxy.url);
}

/**
 * Chrome `--proxy-server=` argument value.
 * @param {ProxyConfig} proxy
 * @returns {string}
 */
function toPuppeteerProxyServer(proxy) {
  const scheme = proxy.protocol === 'socks:' ? 'socks5' : proxy.protocol.replace(':', '');
  const port = proxy.port ? `:${proxy.port}` : '';
  return `${scheme}://${proxy.host}${port}`;
}

/**
 * Puppeteer page authentication credentials, when the proxy needs auth.
 * @param {ProxyConfig} proxy
 * @returns {{ username: string, password: string }|null}
 */
function toPuppeteerAuth(proxy) {
  if (!proxy.username) return null;
  return { username: proxy.username, password: proxy.password || '' };
}

module.exports = {
  proxyUrlFromEnv,
  parseProxyUrl,
  normalizeProtocol,
  resolveProxy,
  redactProxyUrl,
  describeProxy,
  toPuppeteerProxyServer,
  toPuppeteerAuth,
};
