## API

### High-level (recommended)

| Function | Description |
| --- | --- |
| `getToken(options?)` | cache → refresh → login, then persist |
| `resolveToken(options?)` | like `getToken`, also returns `source` (`cache` / `refresh` / `login`) |
| `login(options?)` | force a fresh login (`force: true`) and persist |
| `refreshStoredToken(options?)` | refresh the stored token for a profile |
| `refreshToken(refreshToken, options?)` | refresh an arbitrary refresh token |
| `status(options?)` | inspect state — **never** contains secrets |
| `logout(options?)` | remove the credential (`purge: true` also clears profile + browser data) |
| `importGppt(options?)` | import a gppt credential |
| `getProvider(id)` / `providerPlan(id)` | provider selection (advanced) |

```js
const {
  getToken, login, refreshToken, refreshStoredToken,
  status, logout, importGppt,
  loadProfile, saveProfile, listProfiles,
  FileTokenStore, MemoryTokenStore,
} = require('pixiv-token-getter');
```

### Providers

```ts
interface AuthProvider {
  readonly id: string;
  readonly methods: AuthMethod[];
  login(options: LoginOptions): Promise<TokenInfo>;
  refresh?(refreshToken: string, options?: RefreshOptions): Promise<TokenInfo>;
  isAvailable?(): Promise<boolean>;
}
```

- `native` — Puppeteer + PKCE. Methods: `oauth` / `browser` / `e2e`. The only provider that can capture web cookies.
- `gppt` — optional. Methods: `import` (read the token file) / `e2e` (run `gppt login`).

**Fallback policy:** `provider: 'native'` or `'gppt'` uses exactly that provider — no implicit fallback. Only `provider: 'auto'` may try `[native, gppt]`, each **at most once**, and it stops on a definitive auth failure. There is no login storm.

### Token storage

```ts
interface TokenStore {
  load(profile: string): Promise<TokenInfo | null>;
  save(profile: string, token: TokenInfo): Promise<void>;
  remove(profile: string): Promise<void>;
}
```

`FileTokenStore` is the default. Writes are atomic (`write temp → fsync → rename → chmod 0600`), so an interrupted process can never leave an empty or half-written token file, and a failed save keeps the previous credential intact. `MemoryTokenStore` is provided for tests/ephemeral use.

### `TokenInfo`

```ts
interface TokenInfo {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at?: string;   // absolute ISO-8601 WITH timezone — prefer this
  obtained_at?: string;  // absolute ISO-8601 WITH timezone
  token_type?: string;
  scope?: string;
  user?: { id?: string; name?: string; account?: string };
  web_cookies?: Record<string, string>;  // native browser login only
  provider?: 'native' | 'gppt' | 'auto';
  method?: 'oauth' | 'browser' | 'e2e' | 'import';
  last_refreshed_at?: string;
}
```

Helpers: `isTokenExpired(token, skewMs?)` (default skew **5 minutes**), `msUntilExpiry(token)`, `normalizeTokenInfo(raw)`.

### Errors

Branch on `error.code` — never parse messages:

| Class | `code` | Typical handling |
| --- | --- | --- |
| `AuthError` | `AUTH_ERROR` | base class |
| `LoginError` | `LOGIN_ERROR` | ask the user to log in again |
| `TokenExchangeError` | `TOKEN_EXCHANGE_ERROR` | retry with backoff |
| `RefreshError` | `REFRESH_ERROR` | re-login required |
| `ProviderUnavailableError` | `PROVIDER_UNAVAILABLE` | try another provider / install deps |
| `ProfileError` | `PROFILE_ERROR` | fix config |
| `TokenStoreError` | `TOKEN_STORE_ERROR` | disk/permission problem |
| `TwoFactorRequiredError` | `TWO_FACTOR_REQUIRED` | prompt for a TOTP code |

```js
const { RefreshError } = require('pixiv-token-getter');

try {
  await getToken({ refreshOnly: true });
} catch (error) {
  if (error instanceof RefreshError) notifyUserToLogInAgain();
  else throw error;
}
```

### Legacy API (still supported)

Nothing was removed. These keep their original signatures:

```js
const {
  getTokenInteractive, getTokenHeadless,
  loginInteractive, loginHeadless,
  collectWebCookies, DEFAULT_USER_DATA_DIR,
} = require('pixiv-token-getter');
```

Two intentional differences from `2.3`:

1. `DEFAULT_USER_DATA_DIR` is now `.../browser/default` (migrated automatically, nothing to do).
2. The CLI **masks** tokens in its output instead of printing them; use `ptg token --show-secret` if you genuinely need the raw value.

See [MIGRATION.en.md](./MIGRATION.en.md) for the full, step-by-step guide.

