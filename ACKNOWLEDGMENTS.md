# Acknowledgments

`pixiv-token-getter` stands on the shoulders of a small number of excellent
open-source projects. This file records what we borrowed — and, just as
importantly, what we did **not**.

---

## gppt — `eggplants/get-pixivpy-token`

- **Project:** https://github.com/eggplants/get-pixivpy-token
- **License:** MIT
- **What it is:** a Python tool that obtains Pixiv credentials (OAuth token and
  refresh token) via a headless browser or a device-code style flow, and stores
  them in a structured token file.

### What we intentionally borrowed (design, not code)

The **credential-lifecycle model** of `pixiv-token-getter` 2.4.0 was designed by
studying gppt (v5). In particular, the following *ideas* were adopted:

- **One credential store per profile**, with a background CLI login and a
  machine-readable record of `access_token` / `refresh_token`.
- **A validity window:** store an *absolute* expiry and treat a token near its
  expiry as already expired (a safety skew), instead of trusting `expires_in`
  arithmetic across process restarts.
- **Refresh-first, login-last:** reuse a cached token if valid, otherwise refresh,
  and only fall back to an interactive login when refresh is impossible.
- **An OAuth vs. E2E split** for login: a user-driven browser login for normal
  use, and an automated username/password flow for unattended setup.
- **A profile concept**, so multiple Pixiv accounts can coexist.
- **Interoperability by file contract:** gppt's token file is a stable, documented
  boundary we can read without depending on the Python package.

### What we deliberately did NOT do

- **No gppt source code was copied.** The Node.js implementation (PKCE, the
  Puppeteer flows, the store, the provider layer) is original work.
- **No hard dependency on gppt or Python.** gppt is an *optional* interoperability
  provider. `npm install pixiv-token-getter` never installs or requires Python, and
  the native provider works fully standalone.
- **We never parse gppt's stdout.** Importing a gppt credential reads its
  structured token file (`<profile>.token.json`) only — scraping console output for
  secrets would be brittle and insecure.
- **We never fabricate `web_cookies` for a gppt-imported token.** A gppt credential
  carries an App-API token, not a website session. The field is omitted rather than
  filled with a fake value.

### File-format compatibility

`ptg import gppt` looks for gppt's credential file at, in order:

1. `$GPPT_CONFIG_DIR`
2. `$XDG_CONFIG_HOME/gppt`
3. `~/.config/gppt`

with the file name `<profile>.token.json` (a bare `.token.json` is also accepted
for the default profile). We expand `~` ourselves, because gppt does not.

---

## Other inspirations

- **[Puppeteer](https://pptr.dev/)** — Apache-2.0 — headless browser automation.
- **[axios](https://axios-http.com/)** — MIT — HTTP transport for the token endpoint.
- **Pixiv's OAuth2 + PKCE flow** — the public client flow documented by the
  community; the constants used here are the long-standing public app credentials
  that third-party clients have used for years.

---

## Attribution in this repository

- [`README.md`](./README.md) / [`README.en.md`](./README.en.md) — the Credits
  section points here and to gppt.
- [`LICENSE`](./LICENSE) — this project's own license (MIT), matching gppt's.

If you believe something here is mis-attributed, please open an
[issue](https://github.com/redtidev1918/pixiv-token-getter/issues) so it can be
corrected.
