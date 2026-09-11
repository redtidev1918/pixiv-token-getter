# Migration Guide

[中文文档](./MIGRATION.zh-CN.md) | [English](./MIGRATION.md)

**From `2.3.x` → `2.4.x`**

`2.4.0` upgrades this package from a *one-shot token getter* into a **credential
manager**. It is a **non-breaking** minor release: nothing was removed, and every
legacy export keeps its original signature. This guide covers the small number of
behavioral changes and shows the recommended new API.

If you only used `getTokenInteractive()` / `getTokenHeadless()` and the
`--interactive` / `--headless` CLI flags, **you do not have to change anything** —
but read section 2 and 3, which contain two intentional behavior differences.

---

## 1. Recommended: move to the lifecycle API

The old helpers always perform a **login**. The new `getToken()` first reuses a
cached token, then refreshes it, and only logs in as a last resort. For anything
that runs more than once, this is the single most valuable change.

```js
// Before (2.3) — logs in every time
const { getTokenInteractive } = require('pixiv-token-getter');
const token = await getTokenInteractive();

// After (2.4) — cache → refresh → login, then persist. Log in once, reuse forever.
const { getToken } = require('pixiv-token-getter');
const token = await getToken({ profile: 'default' });
```

Both still work. The legacy call is now a thin wrapper that forces a browser
login, so it is the correct choice only when you *want* a fresh interactive login.

### API mapping

| 2.3 | 2.4 (recommended) | Notes |
| --- | --- | --- |
| `getTokenInteractive(opts)` | `getToken(opts)` | lifecycle; add `force: true` for the old always-login behavior |
| `getTokenHeadless({ username, password })` | `getToken({ method: 'e2e', username, password })` or `login(...)` | same automation, now cached/refreshable |
| — | `refreshToken(value)` | refresh an arbitrary refresh token |
| — | `refreshStoredToken({ profile })` | refresh a profile's stored token |
| — | `resolveToken(opts)` | like `getToken`, also tells you `source` |
| — | `status({ profile })` | inspect state without secrets |
| — | `logout({ profile })` | remove a credential |
| — | `importGppt({ profile })` | import a gppt credential |

`loginInteractive()` / `loginHeadless()` remain exported with unchanged
signatures; `getTokenInteractive` / `getTokenHeadless` are now aliases over them.

---

## 2. Behavior change: `DEFAULT_USER_DATA_DIR`

The default persistent browser profile moved under a per-profile directory:

```
2.3:  ~/.config/pixiv-token-getter/profile
2.4:  ~/.config/pixiv-token-getter/browser/default
```

**Nothing to do.** On first use, `2.4.0` automatically migrates the old `profile/`
directory to `browser/default/`, so existing logins survive the upgrade. If you
hard-coded the old absolute path, update it — but prefer passing `userDataDir`
explicitly or using the `paths` helpers:

```js
const { paths } = require('pixiv-token-getter');
paths.getBrowserDir('default'); // .../browser/default
```

---

## 3. Behavior change: the CLI masks secrets

In `2.3`, `ptg --interactive` printed the raw `access_token` / `refresh_token`.
In `2.4`, secrets are **masked by default** (`********abcd`) — in human output
*and* in `--json` — to keep credentials out of shell scrollback, CI logs and
screen shares.

If a script of yours parses stdout to read the token, **stop doing that** — it is
fragile and it is now masked. Use one of the supported, stable surfaces instead:

```bash
# machine-readable, from the store (still masked)
ptg token --json

# explicitly print the raw value (opt-in)
ptg token --show-secret

# or read the store directly from your program
```

```js
const { FileTokenStore } = require('pixiv-token-getter');
const token = await new FileTokenStore().load('default');
```

---

## 4. CLI migration

The command names are new; the old flags are **kept and deprecated** so existing
scripts keep working.

| 2.3 | 2.4 | Status |
| --- | --- | --- |
| `ptg --interactive` | `ptg login` / `ptg login --method browser` | deprecated alias, still works |
| `ptg --headless u p` | `ptg login --method e2e --username u --password p` | deprecated alias, still works |
| `ptg --interactive --output=f.json` | `ptg login --output=f.json` | still works |
| `npm start` | `ptg login` | `npm start` still runs the CLI |

New commands:

```bash
ptg login      # cache → refresh → login, then persist
ptg refresh    # refresh the stored token
ptg status     # inspect (never prints secrets)
ptg configure  # save non-secret profile preferences
ptg logout     # remove stored credentials (--purge also clears profile + browser)
ptg import gppt
ptg token      # print the stored token (masked unless --show-secret)
```

**Exit codes** are now stable and useful in CI:
`0` ok · `1` error · `2` usage · `3` provider unavailable · `4` no/invalid credential state.

---

## 5. Errors: branch on `error.code`

`2.3` threw plain `Error`s with descriptive messages. `2.4` adds error classes
with a stable `code`. Messages are still human-readable, but please switch to
type/code checks:

```js
const { RefreshError, LoginError } = require('pixiv-token-getter');

try {
  await getToken({ refreshOnly: true });
} catch (error) {
  if (error instanceof RefreshError) {
    // refresh token missing/expired → re-login is required
  } else if (error instanceof LoginError) {
    // user action needed
  } else {
    throw error;
  }
}
```

| Class | `code` |
| --- | --- |
| `AuthError` | `AUTH_ERROR` |
| `LoginError` | `LOGIN_ERROR` |
| `TokenExchangeError` | `TOKEN_EXCHANGE_ERROR` |
| `RefreshError` | `REFRESH_ERROR` |
| `ProviderUnavailableError` | `PROVIDER_UNAVAILABLE` |
| `ProfileError` | `PROFILE_ERROR` |
| `TokenStoreError` | `TOKEN_STORE_ERROR` |
| `TwoFactorRequiredError` | `TWO_FACTOR_REQUIRED` |

---

## 6. Token shape: additive fields only

`TokenInfo` gained **optional** fields. Existing fields are unchanged, so old
code keeps working:

```ts
interface TokenInfo {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type?: string;
  scope?: string;
  user?: { id?: string; name?: string; account?: string };
  // new in 2.4 (all optional):
  expires_at?: string;       // absolute ISO-8601 WITH timezone — prefer this over expires_in
  obtained_at?: string;
  web_cookies?: Record<string, string>;
  provider?: 'native' | 'gppt' | 'auto';
  method?: 'oauth' | 'browser' | 'e2e' | 'import';
  last_refreshed_at?: string;
}
```

Prefer `expires_at` over computing `Date.now() + expires_in * 1000`: it is
absolute, timezone-aware, and survives process restarts.

```js
const { isTokenExpired } = require('pixiv-token-getter');
isTokenExpired(token);        // default 5-minute safety skew
isTokenExpired(token, 0);     // no skew
```

---

## 7. What is new (and safe to adopt)

- **Profiles** — `profiles/<name>.json`, `tokens/<name>.token.json`, `browser/<name>/`.
  Use `ptg configure --profile main` and `getToken({ profile: 'main' })`.
- **Refresh** — `refreshToken()` / `refreshStoredToken()`, rotation-safe.
- **Atomic storage** — writes go through temp file → `fsync` → `rename` → `chmod 0600`.
- **Providers** — `native` (default), `gppt` (optional), `auto` (controlled fallback).
- **gppt interoperability** — `ptg import gppt` reads gppt's structured token file;
  it never parses stdout and never requires Python for anything else.
- **Web cookies** — `token.web_cookies.PHPSESSID` from native browser login only.
- **Proxy** — one resolver for both the browser and token requests.

---

## 8. Checklist

- [ ] Replace `getTokenInteractive()` with `getToken()` where you only need a token.
- [ ] Stop parsing CLI stdout for tokens; use the library or `ptg token --json`.
- [ ] Switch error handling to `error.code` / error classes.
- [ ] Prefer `expires_at` over in-memory `expires_in` math.
- [ ] If you hard-coded `.../profile`, switch to `paths.getBrowserDir(profile)`.
- [ ] For servers/CI, use `getToken({ refreshOnly: true })` and never log in there.
- [ ] Add `*.token.json`, `pixiv-token.json`, `.config/pixiv-token-getter/` to `.gitignore`.

---

## Need the exact old behavior?

Everything maps back one-to-one:

```js
// 2.3 interactive, verbatim behavior
const token = await getTokenInteractive({ timeout: 300000 });

// 2.4 equivalent (forced fresh login, browser)
const token = await getToken({ method: 'browser', force: true, timeout: 300000 });

// 2.3 headless, verbatim behavior
const token = await getTokenHeadless({ username, password });

// 2.4 equivalent (forced fresh login, automated)
const token = await getToken({ method: 'e2e', force: true, username, password });
```

If you hit a case this guide does not cover, please open an
[issue](https://github.com/redtidev1918/pixiv-token-getter/issues).
