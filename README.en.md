# Pixiv Token Getter

A Pixiv credential manager for Node.js. It logs in, caches, refreshes, and stores OAuth tokens; callers own their Pixiv business logic. It provides a library API and the `ptg` CLI.

[中文](README.md) · [Documentation site](https://redtidev1918.github.io/pixiv-token-getter/#/README.en.md) · [Changelog](CHANGELOG.md)

## Install

Requires Node.js **22.12.0 or newer**. Native login also requires an existing Chrome or Chromium installation: `puppeteer-core` does not download a browser. Set `PUPPETEER_EXECUTABLE_PATH` if the browser is not found.

```sh
npm install pixiv-token-getter
```

For the `ptg` command:

```sh
npm install -g pixiv-token-getter
```

**Neither Python nor gppt is required.** Without them, native login, token caching, and refresh work normally. Python is needed only if you ask ptg to run `gppt login`; importing an existing gppt token file does not run Python. See the [guides](docs/en/GUIDES.md#importing-a-gppt-credential).

## Quick start

```sh
ptg login             # open a browser, log in, and save the credential
ptg status            # inspect state without revealing secrets
ptg refresh           # explicitly refresh the stored token
```

Get a usable token in Node.js:

```js
const { getToken } = require('pixiv-token-getter');

const token = await getToken({ profile: 'default' });
// Pass token.access_token to your Pixiv App API client.
```

`getToken()` uses a valid cached token first, then tries the stored refresh token, and logs in only when needed. `ptg login` and the library's `login()` always start a fresh login.

## Unattended use

Log in locally first, then provide the credential securely to the runtime. `refreshOnly` prevents a browser login and **actively refreshes** the stored token, even when the cached access token is still valid. It fails if no refresh token is stored or refresh fails.

```js
const token = await getToken({ profile: 'default', refreshOnly: true });
```

## Credentials and security

State defaults to `~/.config/pixiv-token-getter/`; `XDG_CONFIG_HOME` and `PIXIV_TOKEN_GETTER_CONFIG_DIR` can change the location. `tokens/<profile>.token.json` contains secrets. Keep it, CLI `--output` files, and browser profiles out of Git. Token writes use atomic replacement; on systems with POSIX permissions, token files use mode `0600`.

The CLI masks tokens and cookies by default. `ptg token --show-secret` reveals them, so avoid logging its output. `configure` stores login preferences, not passwords. Native browser login may capture a Pixiv web session cookie, which serves a different purpose from the App API access token.

## Documentation

| Goal | Guide |
| --- | --- |
| Login methods, profiles, proxies, CI, gppt | [Guides](docs/en/GUIDES.md) |
| Commands and exit codes | [CLI reference](docs/en/CLI.md) |
| Functions, types, and errors | [API reference](docs/en/API.md) |
| Upgrade from older versions | [Migration guide](MIGRATION.en.md) |

Report problems in [Issues](https://github.com/redtidev1918/pixiv-token-getter/issues).
