# Decisions

- **Scope:** this package owns credentials and OAuth lifecycle; callers own Pixiv business logic.
- **Authentication:** native PKCE/browser login is the sole provider. Browser cookies are captured only from browser sessions.
- **gppt removal:** no Python interop, import command/API, or provider fallback. Historical `gppt`/`auto` profiles map to `native`; `import` maps to `oauth` on read. New settings reject removed values.
- **Compatibility:** preserve existing token files and refresh tokens. Document CLI/API breaking changes in both languages and use a major release.
