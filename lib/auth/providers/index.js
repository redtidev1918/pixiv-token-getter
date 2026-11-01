/**
 * Provider registry + selection.
 *
 * The native provider is the only supported login path.
 */

const native = require('./native');
const { ProviderUnavailableError } = require('../../errors');
const { PROVIDER_IDS } = require('../profile/profile-store');

/** @type {Record<string, typeof native>} */
const PROVIDERS = {
  [native.id]: native,
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
  return [getProvider(providerId)];
}

/**
 * Run a login with the selected provider.
 *
 * @param {Object} options
 * @param {string} [options.provider='native']
 * @param {(provider: any, error: Error) => void} [options.onProviderFailure]
 * @returns {Promise<{ token: import('../token/token-info').TokenInfo, providerId: string, attempts: string[] }>}
 */
async function loginWithFallback(options = {}) {
  const providerId = options.provider || 'native';
  const provider = getProvider(providerId);
  try {
    const token = await provider.login(options);
    return { token, providerId, attempts: [providerId] };
  } catch (error) {
    if (typeof options.onProviderFailure === 'function') options.onProviderFailure(provider, error);
    throw error;
  }
}

module.exports = {
  PROVIDERS,
  getProvider,
  providerPlan,
  loginWithFallback,
  native,
};
