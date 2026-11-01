# Authentication and token lifecycle

[中文](../ARCHITECTURE.md) · [Home](../../README.en.md)

`ptg` manages Pixiv credentials only. The CLI and library API share `lib/auth/token/lifecycle.js`: load the profile, select native authentication, then let `getToken()` use cache → refresh → login. `login()` forces a fresh login; `refreshStoredToken()` only refreshes.

The native provider exchanges PKCE credentials through Pixiv OAuth. Browser login may also capture website cookies. Refresh preserves existing cookies and retains the old refresh token when no replacement is returned. `FileTokenStore` writes tokens atomically per profile; profile preferences and browser data are stored separately. The same proxy resolution is used for browser and token requests.

Old gppt/auto/import preferences map to native/oauth on read; existing ptg token files remain usable. Callers own Pixiv business logic. See the [migration guide](../../MIGRATION.en.md).
