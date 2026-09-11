/**
 * Provider registry + selection.
 *
 * All provider branching lives here. The CLI and the lifecycle layer only ever
 * ask for "the plan" — they never do `if (provider === 'gppt')` themselves.
 *
 * Fallback policy (see README):
 *  - 'native' / 'gppt' → exactly one provider, no fallback.
 *  - 'auto'            → ordered [native, gppt], each tried AT MOST ONCE.
 *    Implicit provider storms (native → browser → gppt → native) are not possible.
 */

const native = require('./native');
const gppt = require('./gppt');
const { ProviderUnavailableError } = require('../../errors');
const { PROVIDER_IDS } = require('../profile/profile-store');

/** @type {Record<string, typeof native>} */
const PROVIDERS = {
  [native.id]: native,
  [gppt.id]: gppt,
};

/**
 * @param {string} providerId
 * @returns {typeof native}
 * @throws {ProviderUnavailableError}
 */
function getProvider(providerId) {
  const provider = PROVIDERS[providerId];
  if (!provider) {
    throw new ProviderUnavailableError(
      `Unknown provider "${providerId}". Expected one of: ${PROVIDER_IDS.join(', ')}`,
      { details: { provider: providerId } }
    );
  }
  return provider;
}

/**
 * Build the ordered list of providers to attempt for a selection.
 *
 * @param {string} [providerId='native']
 * @returns {Array<typeof native>}
 */
function providerPlan(providerId = 'native') {
  // Read through the registry (not the imported consts) so the plan always
  // reflects the current provider table.
  if (providerId === 'auto') return [getProvider('native'), getProvider('gppt')];
  return [getProvider(providerId)];
}

/**
 * Run a login, honouring the fallback policy.
 *
 * @param {Object} options
 * @param {string} [options.provider='native']
 * @param {(provider: any, error: Error) => void} [options.onProviderFailure]
 * @returns {Promise<{ token: import('../token/token-info').TokenInfo, providerId: string, attempts: string[] }>}
 */
async function loginWithFallback(options = {}) {
  const providerId = options.provider || 'native';
  const plan = providerPlan(providerId);
  const attempts = [];
  let lastError = null;

  for (const provider of plan) {
    attempts.push(provider.id);
    try {
      // eslint-disable-next-line no-await-in-loop
      const token = await provider.login(options);
      return { token, providerId: provider.id, attempts };
    } catch (error) {
      lastError = error;
      if (typeof options.onProviderFailure === 'function') {
        options.onProviderFailure(provider, error);
      }
      // 'auto' is the ONLY selection that may continue to the next provider.
      if (providerId !== 'auto') throw error;
      if (error && error.code === 'PROVIDER_UNAVAILABLE') continue;
      // For non-availability failures under 'auto' we still allow one attempt
      // per provider, but stop on the first *definitive* auth failure to avoid
      // a login storm against Pixiv.
      if (error && ['LOGIN_ERROR', 'TOKEN_EXCHANGE_ERROR'].includes(error.code)) throw error;
    }
  }

  throw lastError || new ProviderUnavailableError('No auth provider could complete the login');
}

module.exports = {
  PROVIDERS,
  getProvider,
  providerPlan,
  loginWithFallback,
  native,
  gppt,
};
