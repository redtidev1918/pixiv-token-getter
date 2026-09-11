const test = require('node:test');
const assert = require('node:assert/strict');

const {
  resolveProxy,
  proxyUrlFromEnv,
  parseProxyUrl,
  redactProxyUrl,
  toPuppeteerProxyServer,
  toPuppeteerAuth,
  describeProxy,
} = require('../lib/auth/proxy/proxy');
const { AuthError } = require('../lib/errors');

test('explicit proxy wins over the environment', () => {
  const proxy = resolveProxy('http://explicit:8080', {
    env: { HTTPS_PROXY: 'http://env:3128' },
  });
  assert.equal(proxy.host, 'explicit');
  assert.equal(proxy.port, 8080);
  assert.equal(proxy.source, 'option');
});

test('environment precedence is ALL_PROXY > HTTPS_PROXY > HTTP_PROXY', () => {
  assert.equal(
    proxyUrlFromEnv({ ALL_PROXY: 'http://all:1', HTTPS_PROXY: 'http://https:2', HTTP_PROXY: 'http://http:3' }),
    'http://all:1'
  );
  assert.equal(
    proxyUrlFromEnv({ HTTPS_PROXY: 'http://https:2', HTTP_PROXY: 'http://http:3' }),
    'http://https:2'
  );
  assert.equal(proxyUrlFromEnv({ HTTP_PROXY: 'http://http:3' }), 'http://http:3');
  assert.equal(proxyUrlFromEnv({ all_proxy: 'http://lower:1' }), 'http://lower:1');
  assert.equal(proxyUrlFromEnv({}), null);
});

test('the same env proxy is used for token requests and for the browser', () => {
  const proxy = resolveProxy(undefined, { env: { HTTPS_PROXY: 'http://env-proxy:3128' } });
  assert.equal(proxy.source, 'env');
  assert.equal(proxy.host, 'env-proxy');
  // Chrome argument derived from the very same resolved config.
  assert.equal(toPuppeteerProxyServer(proxy), 'http://env-proxy:3128');
});

test('proxy:false explicitly disables proxying and ignores the environment', () => {
  assert.equal(resolveProxy(false, { env: { ALL_PROXY: 'http://env:1' } }), null);
});

test('socks proxies are normalised for Chrome', () => {
  const proxy = parseProxyUrl('socks5://127.0.0.1:1080', 'option');
  assert.equal(proxy.protocol, 'socks:');
  assert.equal(toPuppeteerProxyServer(proxy), 'socks5://127.0.0.1:1080');
});

test('default ports are inferred', () => {
  assert.equal(parseProxyUrl('http://host', 'option').port, 80);
  assert.equal(parseProxyUrl('https://host', 'option').port, 443);
  assert.equal(parseProxyUrl('socks5://host', 'option').port, 1080);
});

test('proxy credentials are exposed to the browser but never logged', () => {
  const proxy = resolveProxy('http://user:s3cret@proxy:8080');
  assert.deepEqual(toPuppeteerAuth(proxy), { username: 'user', password: 's3cret' });
  assert.equal(redactProxyUrl(proxy.url), 'http://user:***@proxy:8080');
  assert.equal(describeProxy(proxy), 'http://user:***@proxy:8080');
  assert.ok(!describeProxy(proxy).includes('s3cret'));
  assert.equal(describeProxy(null), null);
});

test('a malformed proxy URL is rejected with a redacted message', () => {
  assert.throws(
    () => resolveProxy('not-a-url'),
    (error) => error instanceof AuthError && /Invalid proxy URL/.test(error.message)
  );
  assert.throws(() => resolveProxy({ noUrl: true }), AuthError);
});

test('an object form with a url is accepted', () => {
  const proxy = resolveProxy({ url: 'http://obj:9999' });
  assert.equal(proxy.host, 'obj');
  assert.equal(proxy.port, 9999);
});
