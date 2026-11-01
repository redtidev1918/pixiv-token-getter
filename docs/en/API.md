# API reference

[中文](../API.md) · [Home](../../README.en.md) · [Guides](GUIDES.md)

Requires Node.js >= 22.12.0. The package provides `require()` and `import` entry points; see the root `index.d.ts` for complete types.

## Getting a token

```js
const { getToken, resolveToken, refreshStoredToken, status } =
  require('pixiv-token-getter');

const token = await getToken({ profile: 'main' });
const result = await resolveToken({ profile: 'main' });
console.log(result.source); // cache | refresh | login

await refreshStoredToken({ profile: 'main' });
const state = await status({ profile: 'main' }); // no raw secrets
```

| Function | Behavior |
| --- | --- |
| `getToken(options?)` | Valid cache → refresh → login; returns `TokenInfo` |
| `resolveToken(options?)` | Same lifecycle; returns `{ token, source, providerId }` |
| `login(options?)` | Skip cache and refresh, then log in and save |
| `refreshStoredToken(options?)` | Force a refresh even when the access token is valid |
| `refreshToken(refreshToken, options?)` | Refresh against Pixiv without reading or writing profile storage |
| `status(options?)` | Return state without secret values |
| `logout({ profile?, purge? })` | Delete the token; `purge` also removes preferences and browser data |

Common `getToken` options:

| Option | Meaning |
| --- | --- |
| `profile` | Profile name; defaults to `default` |
| `provider` | `native`; defaults to the profile preference |
| `method` | `oauth` / `browser` / `e2e` |
| `force` | Skip cache and refresh, then log in again |
| `refreshOnly` | Never log in; actively refresh the stored token or fail |
| `proxy` | Proxy URL; `false` disables proxying |
| `skewMs` | Expiry safety margin; defaults to five minutes |

`native` is the only provider. Its `oauth` and `browser` methods open a browser for user login; `e2e` fills in credentials automatically.

## Token shape

```ts
interface TokenInfo {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at?: string;
  obtained_at?: string;
  user?: { id?: string; name?: string; account?: string };
  web_cookies?: Record<string, string>;
  provider?: 'native';
  method?: 'oauth' | 'browser' | 'e2e';
}
```

`expires_at` is an absolute timestamp with a timezone. Use `isTokenExpired(token, skewMs?)` or `msUntilExpiry(token)` to check expiry. Only native browser login can produce web cookies.

## Profiles and storage

`loadProfile(name?)`, `saveProfile(name, patch)`, `listProfiles()`, and `removeProfile(name?)` manage login preferences. `FileTokenStore` is the default token store; `MemoryTokenStore` is available for ephemeral use. File storage replaces tokens atomically and uses mode `0600` on POSIX systems. Query paths with helpers such as `paths.getConfigDir()` and `paths.getTokenFilePath(profile)`.

## Errors

Branch on `error.code` or an error class, never message text:

| Error class | code |
| --- | --- |
| `AuthError` | `AUTH_ERROR` |
| `LoginError` | `LOGIN_ERROR` |
| `TokenExchangeError` | `TOKEN_EXCHANGE_ERROR` |
| `RefreshError` | `REFRESH_ERROR` |
| `ProviderUnavailableError` | `PROVIDER_UNAVAILABLE` |
| `ProfileError` | `PROFILE_ERROR` |
| `TokenStoreError` | `TOKEN_STORE_ERROR` |
| `TwoFactorRequiredError` | `TWO_FACTOR_REQUIRED` |

```js
const { getToken, RefreshError } = require('pixiv-token-getter');

try {
  await getToken({ refreshOnly: true });
} catch (error) {
  if (error instanceof RefreshError) {
    // Supply a usable refresh token again.
  } else {
    throw error;
  }
}
```

Legacy `getTokenInteractive()`, `getTokenHeadless()`, `loginInteractive()`, and `loginHeadless()` remain available. Prefer the lifecycle API for new code; see the [migration guide](../../MIGRATION.en.md).
