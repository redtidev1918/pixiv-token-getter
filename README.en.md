# Pixiv Token Getter

> A **Node.js Pixiv credential manager and authentication facade** — token cache, refresh-token lifecycle, profiles, and a browser/native login — with optional [gppt](https://github.com/eggplants/get-pixivpy-token) interoperability.

**Also known as:** `ptg` (CLI command alias)

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22.12.0-brightgreen)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Docs](https://img.shields.io/badge/Docs-documentation-6366f1?style=flat-square)](https://redtidev1918.github.io/pixiv-token-getter/)

**Language / 语言:** [中文](README.md) · English

📖 [Full documentation](https://redtidev1918.github.io/pixiv-token-getter/)

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

## Documentation

This README only covers the entry points; guides, API, and CLI details live on the
[docs site](https://redtidev1918.github.io/pixiv-token-getter/):

| What you want | Where |
| --- | --- |
| Login, refresh, profiles, web cookies, proxies | [Guides](docs/en/GUIDES.md) |
| Call it from code | [API](docs/en/API.md) |
| Command-line flags | [CLI reference](docs/en/CLI.md) |

## Requirements

- **Node.js >= 22.12.0** (matches `package.json#engines`)
- Puppeteer (installed as a dependency; Chromium is downloaded automatically)
- *Optional:* Python + `gppt`, only for the gppt interoperability provider

## Credits

The credential-lifecycle design (profile → cached token → validity → refresh → fallback login, plus `expires_at` handling, the profile concept and the OAuth/E2E split) was **inspired by** [eggplants/get-pixivpy-token (gppt)](https://github.com/eggplants/get-pixivpy-token), which is MIT-licensed. No gppt source code was copied; the Node.js implementation is original. See [ACKNOWLEDGMENTS.en.md](./ACKNOWLEDGMENTS.en.md).

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
- [Migration guide](./MIGRATION.en.md)

For issues, please submit an [Issue](https://github.com/redtidev1918/pixiv-token-getter/issues).
