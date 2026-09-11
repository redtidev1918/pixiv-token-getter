/**
 * Credential lifecycle example.
 *
 * Demonstrates the recommended 2.4+ API: log in once (locally), then let
 * `getToken()` reuse the cache and refresh the token automatically — in any
 * other process, forever.
 *
 * Run with:  node examples/credential-lifecycle.js
 *
 * Nothing here talks to Pixiv until you actually call `getToken()`; the script
 * only prints what it *would* do. Set PIXIV_TOKEN_GETTER_EXAMPLE=run to perform
 * a real flow (it will open a browser for the first login).
 */

const {
  getToken,
  resolveToken,
  refreshToken,
  status,
  logout,
  isTokenExpired,
  maskSecret,
  FileTokenStore,
  RefreshError,
} = require('..');

const PROFILE = process.env.PIXIV_PROFILE || 'default';
const SHOULD_RUN = process.env.PIXIV_TOKEN_GETTER_EXAMPLE === 'run';

/**
 * 1. Inspect the current state WITHOUT revealing secrets.
 *    Safe to call in logs / dashboards.
 */
async function showStatus() {
  const info = await status({ profile: PROFILE });

  console.log(`Profile:        ${info.profile}`);
  console.log(`Provider:       ${info.provider} (${info.method || 'default method'})`);
  console.log(`Has token:      ${info.hasToken}`);
  if (info.hasToken) {
    console.log(`Access token:   ${info.accessToken.valid ? 'valid' : 'expired'}`);
    console.log(`Refresh token:  ${info.refreshToken.present ? 'present' : 'missing'}`);
    console.log(`Web session:    ${info.webSession.present ? info.webSession.cookies.join(', ') : 'none'}`);
    console.log(`Token file:     ${info.tokenFile}`);
  }
}

/**
 * 2. The whole integration: cache → refresh → login, then persist.
 *    This is what a long-running app should call.
 */
async function acquireToken() {
  // `refreshOnly: true` is the right choice for servers/CI: it will never open
  // a browser, and it fails loudly (RefreshError) if a re-login is genuinely
  // required on a machine where that is impossible.
  const onServer = process.env.PIXIV_TOKEN_GETTER_EXAMPLE_MODE === 'server';

  const token = await getToken({
    profile: PROFILE,
    refreshOnly: onServer,
    onEvent: (event) => {
      // Observe the lifecycle without touching secrets.
      console.log(`  [event] ${event.type}`);
    },
  });

  console.log('Obtained an access token:', maskSecret(token.access_token));
  console.log('Expires at:', token.expires_at || `in ${token.expires_in}s`);
  return token;
}

/**
 * 3. Ask WHERE the token came from — cache, refresh, or a fresh login.
 */
async function acquireWithProvenance() {
  const { token, source, providerId } = await resolveToken({ profile: PROFILE });
  console.log(`Resolved via: ${source} (provider: ${providerId})`);
  return token;
}

/**
 * 4. Refresh the STORED token explicitly (e.g. a proactive cron job), and
 *    5. refresh an ARBITRARY refresh token you already hold.
 */
async function refreshExamples(acquired) {
  // Explicit refresh of the stored credential, even if it is still valid:
  const stored = await getToken({
    profile: PROFILE,
    refreshOnly: true,
  });
  console.log('Stored token refreshed; valid:', !isTokenExpired(stored));

  // Refresh a raw refresh token without touching the store:
  const renewed = await refreshToken(acquired.refresh_token);
  console.log('Arbitrary refresh token renewed:', maskSecret(renewed.access_token));
}

/**
 * 6. Remove the credential (and optionally the profile + browser data).
 */
async function removeCredential() {
  const result = await logout({ profile: PROFILE, purge: false });
  console.log('Logout result:', result);
}

async function main() {
  console.log('=== Credential lifecycle example ===\n');

  if (!SHOULD_RUN) {
    console.log('[dry run] Set PIXIV_TOKEN_GETTER_EXAMPLE=run to perform a real flow.\n');

    // Show what the store looks like even in dry-run mode.
    const store = new FileTokenStore();
    console.log('Default token path:', store.pathFor(PROFILE));
    await showStatus();
    return;
  }

  console.log('1) Current status');
  await showStatus();

  console.log('\n2) Acquire a token (cache → refresh → login)');
  let token;
  try {
    token = await acquireToken();
  } catch (error) {
    if (error instanceof RefreshError) {
      console.error('\nRefresh not possible (refreshOnly), and this machine must not log in.');
      console.error('Run "ptg login --profile ' + PROFILE + '" locally, then retry.');
      process.exitCode = 4;
      return;
    }
    throw error;
  }

  console.log('\n3) Provenance');
  await acquireWithProvenance();

  console.log('\n4/5) Refresh');
  await refreshExamples(token);

  console.log('\n6) Done. The credential is persisted; next run will not need a login.');
  console.log('   Use logout() to remove it, or `purge: true` to also clear the browser profile.');
}

main().catch((error) => {
  // Errors carry a stable `code` — branch on it, never parse the message.
  console.error(`\nExample failed [${error.code || 'UNKNOWN'}]: ${error.message}`);
  process.exitCode = 1;
});
