# Acknowledgments

**Language / 语言:** [中文](./ACKNOWLEDGMENTS.md) · English

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

### Current status

No gppt source code was copied. This project no longer provides a gppt provider or credential import. The design history remains here for attribution; see the [migration guide](MIGRATION.en.md) for existing configurations.

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
