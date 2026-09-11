# Pixiv Token Getter

> A **Node.js Pixiv credential manager and authentication facade** — token cache, refresh-token lifecycle, profiles, and a browser/native login — with optional [gppt](https://github.com/eggplants/get-pixivpy-token) interoperability.

**Also known as:** `ptg` (CLI command alias)

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22.12.0-brightgreen)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[中文文档](./README.zh-CN.md) | [English](./README.md)

---

## What this is (and what changed)

This package used to be a "get a token once" tool. It is now a **credential lifecycle manager**:

```
cached token ──valid──▶ reuse
      │
      ├── refresh_token available ──▶ refresh ──▶ atomic save ──▶ use
      │
      └── otherwise ──▶ login (native browser / native PKCE / gppt) ──▶ atomic save ──▶ use
```

You no longer re-login every time. You log in **once, locally**, and production/CI runtimes simply refresh.

```js
const { getToken } = require('pixiv-token-getter');

// cache → refresh → login, then persist. The recommended entry point.
const token = await getToken({ profile: 'default' });
```

## Features

- ✅ **Credential lifecycle** — `getToken()` cache → refresh → login, with persisted absolute expiry
- ✅ **Refresh-token support** — `refreshToken()`, `refreshStoredToken()`, including **rotation-safe** persistence
- ✅ **Multiple profiles** — `--profile main`, `--profile alt`; tokens, prefs and browser data are isolated
- ✅ **Native PKCE OAuth** — the original, first-class implementation (kept and reorganised, not replaced)
- ✅ **Puppeteer browser login** — interactive *and* automated (`e2e`) with optional TOTP second factor
- ✅ **Persistent browser profile** — you usually stay logged in across runs
- ✅ **Web session cookies** — captures `PHPSESSID` for Pixiv **website** scrapers (native provider only)
- ✅ **gppt interoperability (optional)** — import a gppt credential without any Python dependency
- ✅ **Atomic, 0600 credential storage** — a failed write never truncates a good token
- ✅ **Stable error model** — branch on `error.code` instead of parsing messages
- ✅ **TypeScript definitions** — full `.d.ts` for both the new and legacy API

## Installation

```bash
npm install pixiv-token-getter
```

> **No Python required.** `gppt` is an *optional* adapter. The native provider works standalone.

## Quick Start

### CLI

```bash
npm install -g pixiv-token-getter

ptg login        # first time: opens Pixiv login, saves a refresh token
ptg status       # later: inspect state (never prints secrets)
```

Successful first login:

```
[+] Logged in as your_name (ID: 123456)
    Profile:        default
    Provider:       native (oauth)
    Access token:   ********cd12
    Refresh token:  ********ab34
    Expires at:     2026-09-11T12:34:56.000Z (in 59m)
    Web session:    PHPSESSID available
[+] Refresh token saved securely.
```

```
$ ptg status
Profile:        default
Provider:       native (oauth)
User:           your_name (ID: 123456)
Access token:   valid (expires 2026-09-11T12:34:56.000Z)
Expires in:     58m
Refresh token:  present
Web session:    PHPSESSID available
Token file:     ~/.config/pixiv-token-getter/tokens/default.token.json
```

### Library

```js
const { getToken } = require('pixiv-token-getter');

const token = await getToken({
  profile: 'default',
  provider: 'native',   // native | gppt | auto   (default: native)
  method: 'oauth',      // oauth | browser | e2e | import
  force: false,         // true → skip cache and refresh, log in again
});
```

That is the whole integration. `PixivFlow` (and any other Node consumer) only needs this one call.

## Guides

### Native login

Two mechanisms, one provider:

| `method` | What it does | Use when |
| --- | --- | --- |
| `oauth` / `browser` | Opens the Pixiv login page; **you** log in. Aliases of each other. | Normal, most reliable (**recommended**) |
| `e2e` | Automates the username/password form (headless by default) | Unattended setup; may be flagged as automation |

```bash
ptg login                          # == --method oauth
ptg login --method browser
PIXIV_USERNAME=user PIXIV_PASSWORD=pass ptg login --method e2e
```

Legacy flags keep working and map onto the above:

```bash
ptg --interactive              # → ptg login --method browser   (deprecated)
ptg --headless user pass       # → ptg login --method e2e       (deprecated)
ptg --interactive --output=f.json
```

### Refresh

```bash
ptg refresh                 # refresh the stored token for the default profile
ptg refresh --profile main
```

```js
const { refreshToken, refreshStoredToken } = require('pixiv-token-getter');

// Refresh an arbitrary refresh token (no store involved):
const renewed = await refreshToken('the-refresh-token');

// Refresh whatever is stored for a profile (explicit, even if still valid):
const stored = await refreshStoredToken({ profile: 'main' });
```

**Rotation is handled.** Pixiv may return a *new* refresh token; the new one is always persisted, and an empty value will never overwrite a good one.

### Profiles

```bash
ptg configure --profile main --provider native --method oauth
ptg login     --profile main
ptg status    --profile main

ptg configure --list
```

```js
const token = await getToken({ profile: 'main' });
```

State layout (XDG):

```
$XDG_CONFIG_HOME/pixiv-token-getter/     (fallback: ~/.config/pixiv-token-getter/)
├── profiles/<name>.json          non-secret preferences (never passwords)
├── tokens/<name>.token.json      secrets, 0600, written atomically
└── browser/<name>/               persistent Chrome profile, 0700
```

Upgrading from `2.3` migrates the old `profile/` directory to `browser/default/`, so existing logins survive.

### gppt interoperability (optional)

[gppt](https://github.com/eggplants/get-pixivpy-token) is an **optional interoperability provider**, not a dependency.

```bash
pip install gppt
gppt configure
gppt login
```

Then either import its credential when you want to (recommended):

```bash
ptg import gppt
ptg import gppt --profile main --source-profile default
```

or delegate a login explicitly:

```bash
ptg login --provider gppt
ptg login --provider gppt --method e2e    # runs `gppt login` for you
```

```js
await importGppt({ profile: 'main' });   // reads ~/.config/gppt/<profile>.token.json
```

What we deliberately do **not** do:

- ❌ parse gppt's stdout / regex-scrape secrets
- ❌ require Python for core functionality
- ❌ fabricate `web_cookies` for a gppt token (see below)

Credential lookup order: `$GPPT_CONFIG_DIR` → `$XDG_CONFIG_HOME/gppt` → `~/.config/gppt`; file `<profile>.token.json` (bare `.token.json` also accepted for the default profile). `~` is expanded (gppt itself does not).

### Web cookies (`PHPSESSID`)

Two different credentials, two different purposes — do not mix them:

| Credential | Used for | Produced by |
| --- | --- | --- |
| OAuth `access_token` | Pixiv **App API** (`app-api.pixiv.net`) | any provider |
| `web_cookies.PHPSESSID` | Pixiv **website / web session** | native browser login only |

```js
const token = await getToken();
console.log(token.web_cookies); // { PHPSESSID: '...' } — native only
```

A gppt-imported token has **no** `web_cookies`: the field is omitted rather than faked. Refreshing preserves existing cookies (a refresh response carries none).

### Proxy

A single resolver feeds **both** the OAuth/token requests and Puppeteer, so the browser and the token exchange can never disagree:

```bash
export HTTPS_PROXY=http://127.0.0.1:8080
ptg login
```

```js
await getToken({ proxy: 'http://user:pass@proxy:8080' });  // explicit
await getToken({ proxy: false });                          // force-disable proxying
```

Precedence: explicit option → `ALL_PROXY` → `HTTPS_PROXY` → `HTTP_PROXY`. Proxy passwords are redacted in every log and error message.

### Server / headless runtimes (CI, Docker, Fly, Actions)

**Do not** log in from a server. Log in locally once, then only ever refresh:

```js
const token = await getToken({ profile: 'main', refreshOnly: true });
```

`refreshOnly: true` never spawns a browser: if the refresh token is missing/expired, it throws `RefreshError` and the job fails **visibly** instead of launching Chromium in a loop.

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

See [MIGRATION.md](./MIGRATION.md) for the full, step-by-step guide.

## CLI reference

```
ptg login     [--profile] [--provider] [--method] [--username] [--password]
              [--totp-code] [--force] [--output=<file>] [--proxy] [--json] [--quiet]
ptg refresh   [--profile] [--json]
ptg status    [--profile] [--json]
ptg configure [--profile] [--provider] [--method] [--user-data-dir] [--proxy] [--list]
ptg logout    [--profile] [--purge]
ptg import gppt [--profile] [--source-profile] [--json]
ptg token     [--profile] [--json] [--show-secret]
ptg --help | --version
```

Exit codes: `0` ok · `1` error · `2` usage · `3` provider unavailable · `4` no/invalid credential state.

**Secret output policy.** `access_token`, `refresh_token` and `PHPSESSID` are **masked by default** (`********abcd`). `--json` is masked too; only an explicit `--show-secret` prints raw values. Credentials are never written to the terminal scrollback or CI logs by default.

**Environment variables**

| Variable | Purpose |
| --- | --- |
| `PIXIV_USERNAME` / `PIXIV_PASSWORD` | `--method e2e` credentials (keeps the password out of shell history) |
| `PIXIV_TOKEN_GETTER_CONFIG_DIR` | Override the whole state directory |
| `PIXIV_TOKEN_GETTER_GPPT_BIN` | Custom gppt executable (e.g. a venv shim) |
| `GPPT_CONFIG_DIR`, `XDG_CONFIG_HOME` | gppt config lookup |
| `ALL_PROXY` / `HTTPS_PROXY` / `HTTP_PROXY` | Proxy for both the browser and token requests |

## Security

- Secrets live in `tokens/<profile>.token.json` with **`0600`**; directories are **`0700`**.
- Writes are atomic; a failed login/refresh **keeps the previous token file**.
- Passwords are **never** persisted by default (`configure` stores non-secret preferences only).
- TOTP secrets are **opt-in** (`--totp-secret` / `totpSecret`) and never saved automatically.
- Token values are excluded from thrown errors and from log output; HTTP error bodies are redacted.
- gppt stdout is **never** persisted or parsed.
- Proxy credentials are redacted (`http://user:***@host`).
- On Windows there is no POSIX `chmod`: files inherit the private user profile directory ACL, which is why we keep state under `%USERPROFILE%`.

Add these to your `.gitignore`: `pixiv-token.json`, `*.token.json`, `.config/pixiv-token-getter/`.

## Requirements

- **Node.js >= 22.12.0** (matches `package.json#engines`)
- Puppeteer (installed as a dependency; Chromium is downloaded automatically)
- *Optional:* Python + `gppt`, only for the gppt interoperability provider

## Credits

The credential-lifecycle design (profile → cached token → validity → refresh → fallback login, plus `expires_at` handling, the profile concept and the OAuth/E2E split) was **inspired by** [eggplants/get-pixivpy-token (gppt)](https://github.com/eggplants/get-pixivpy-token), which is MIT-licensed. No gppt source code was copied; the Node.js implementation is original. See [ACKNOWLEDGMENTS.md](./ACKNOWLEDGMENTS.md).

## FAQ

**Do I need Python?** No. Only if you explicitly want the gppt interoperability provider (`ptg import gppt` / `--provider gppt`).

**Do tokens expire?** Yes. `access_token` is short-lived; `getToken()` refreshes it automatically using the stored `refresh_token`.

**Why is `getToken()` preferred over `getTokenInteractive()`?** The legacy helper always performs a login. `getToken()` reuses the cache first, then refreshes, and only logs in as a last resort.

**Does the refresh token rotate?** It can. New refresh tokens are always persisted; an empty response never overwrites a good one.

**Can I use this in CI?** Yes — store the credential locally, then use `getToken({ refreshOnly: true })`. Never log in from CI.

**Is `PHPSESSID` the same as an access token?** No. The access token is for the App API; `PHPSESSID` is for the Pixiv website session. Only native browser login produces it.

## Links

- [Pixiv API Documentation](https://www.pixiv.net/help/article/3629)
- [Puppeteer Documentation](https://pptr.dev/)
- [gppt (optional interoperability)](https://github.com/eggplants/get-pixivpy-token)
- [Migration guide](./MIGRATION.md)

For issues, please submit an [Issue](https://github.com/redtidev1918/pixiv-token-getter/issues).
