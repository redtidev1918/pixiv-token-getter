# Guides

[中文](../USAGE.md) · [Home](../../README.en.md) · [CLI](CLI.md) · [API](API.md)

## Login and token lifecycle

Install Node.js >= 22.12.0 and Chrome/Chromium, then run:

```sh
npm install -g pixiv-token-getter
ptg login
ptg status
```

`ptg login` performs a fresh login every time. The library's `getToken()` uses a valid cached token, then attempts a refresh, then logs in if necessary. To refresh the stored token explicitly, run `ptg refresh` or call `refreshStoredToken()`.

| Provider | Method | Purpose |
| --- | --- | --- |
| `native` (default) | `oauth` / `browser` | Open a browser for the user to log in; the names are aliases |
| `native` | `e2e` | Fill in username and password automatically; optional TOTP code |
| `gppt` (optional) | `import` / `e2e` | Read a gppt credential or delegate login to gppt |

Native login uses an installed Chrome/Chromium browser; it never downloads one. Set `PUPPETEER_EXECUTABLE_PATH=/path/to/chrome` if no browser is found. Python is unnecessary for the core library; gppt is optional interoperability.

## Profiles and storage

```sh
ptg login --profile main
ptg login --profile alt
ptg status --profile main
ptg configure --list
```

Save login preferences:

```sh
ptg configure --profile main --provider native --method oauth
```

State defaults to `~/.config/pixiv-token-getter/`; override it with `XDG_CONFIG_HOME` or `PIXIV_TOKEN_GETTER_CONFIG_DIR`. Inside, `profiles/` holds preferences, `tokens/` holds tokens, and `browser/` holds browser data. Each credential is named `<profile>.token.json`. Keep the state directory outside the repository. Writes are atomic; token files have mode `0600` on POSIX systems.

`ptg logout --profile main` deletes that profile's token. Add `--purge` to remove its preferences and browser data too.

## Unattended runtimes

Log in locally first, then transfer the credential to the runtime through a controlled secret channel. `refreshOnly` prevents browser login and actively refreshes even when the cached access token is valid:

```js
const { getToken } = require('pixiv-token-getter');
const token = await getToken({ profile: 'main', refreshOnly: true });
```

It fails when the refresh token is missing or refresh fails. Ordinary `getToken()` can reuse a valid cache, but after a failed refresh it may attempt login, so avoid it in unattended environments.

## Web cookies

The OAuth `access_token` serves the Pixiv App API. `web_cookies.PHPSESSID` is a Pixiv website session cookie. Only native browser login can capture web cookies. gppt imports omit the field; refresh preserves any cookie already stored. Treat both credentials as secrets: do not print or commit them.

## Proxies

An explicit proxy takes precedence. Environment variables are checked in this order: `ALL_PROXY`, `HTTPS_PROXY`, `HTTP_PROXY` (lowercase forms also work). The same resolver supplies the browser and token requests.

```sh
HTTPS_PROXY=http://127.0.0.1:8080 ptg login
ptg login --proxy=http://127.0.0.1:8080
```

```js
await getToken({ proxy: 'http://127.0.0.1:8080' });
await getToken({ proxy: false }); // disable proxying
```

## Importing a gppt credential

gppt is a [separate Python tool](https://github.com/eggplants/get-pixivpy-token), **not a ptg dependency**. Leaving it uninstalled does not affect native `ptg login`, `ptg refresh`, or the library's default `getToken()` flow.

| Operation | Requires Python / gppt? |
| --- | --- |
| Native login, caching, refresh | No |
| `ptg import gppt` reads an existing token file | Does not run Python; the file must already exist |
| `ptg login --provider gppt --method e2e` delegates login to gppt | Yes, install Python and gppt |

If you already have a gppt token file, import it directly:

```sh
ptg import gppt --profile main --source-profile default
```

ptg reads the credential file instead of parsing gppt's terminal output. `GPPT_CONFIG_DIR` selects gppt's config directory.

## Older versions

`ptg --interactive` and `ptg --headless <user> <pass>` still work but are deprecated. See the [migration guide](../../MIGRATION.en.md) for file format and browser profile migration.
