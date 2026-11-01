# Current status

- `ptg` is a Node.js CLI and library for Pixiv credential lifecycle management.
- Native PKCE/browser login, cache, refresh, profiles, browser cookies, and proxy support remain.
- The gppt provider and import API were removed in `7127f72`; old profile preferences migrate on read.
- Local `npm test`: 119 passed after the removal. This does not verify a real account login, CI, or a published release.
