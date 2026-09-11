/**
 * Thin HTTP layer over axios.
 *
 * Everything network-related goes through this module so that:
 *  - tests can inject a fake transport (no real Pixiv calls in CI),
 *  - proxy handling lives in exactly one place.
 */

const { AuthError } = require('./errors');

/**
 * @typedef {Object} HttpRequest
 * @property {string} url
 * @property {Record<string,string>} form  application/x-www-form-urlencoded body
 * @property {Record<string,string>} headers
 * @property {number} timeout
 * @property {import('./auth/proxy/proxy').ProxyConfig|null} [proxy]
 */

/**
 * @typedef {Object} HttpResponse
 * @property {number} status
 * @property {any} data
 */

/**
 * Default axios-based transport.
 * @type {(req: HttpRequest) => Promise<HttpResponse>}
 */
async function axiosTransport(req) {
  const axios = require('axios');
  const config = {
    headers: req.headers,
    timeout: req.timeout,
    // Ask axios to throw for non-2xx so callers get a single error path.
    validateStatus: (status) => status >= 200 && status < 300,
  };

  const proxy = req.proxy;
  if (proxy && proxy.url) {
    // Force the resolved proxy (explicit option or env) for this request only.
    config.proxy = {
      protocol: proxy.protocol,
      host: proxy.host,
      port: proxy.port,
      ...(proxy.username ? { auth: { username: proxy.username, password: proxy.password || '' } } : {}),
    };
  } else if (proxy === null) {
    // Explicitly disabled: do not let axios silently pick up env proxies.
    config.proxy = false;
  }

  try {
    const response = await axios.post(req.url, new URLSearchParams(req.form).toString(), config);
    return { status: response.status, data: response.data };
  } catch (error) {
    if (error && error.response) {
      const err = new AuthError(
        `HTTP ${error.response.status} from ${req.url}`,
        {
          details: { status: error.response.status, body: error.response.data },
          cause: error,
        }
      );
      err.httpStatus = error.response.status;
      err.responseBody = error.response.data;
      throw err;
    }
    throw new AuthError(`Request to ${req.url} failed: ${error && error.message}`, { cause: error });
  }
}

/**
 * POST a form, using the injected transport when provided.
 *
 * @param {HttpRequest} req
 * @param {{ transport?: (req: HttpRequest) => Promise<HttpResponse> }} [deps]
 * @returns {Promise<HttpResponse>}
 */
async function postForm(req, deps = {}) {
  const transport = deps.transport || axiosTransport;
  return transport(req);
}

module.exports = { axiosTransport, postForm };
