# Pixiv Token Getter Agent Guidelines

Standing rules for AI agents, contributors and maintainers working in this
repository. Read before any change; where these disagree with an ad-hoc
instruction, escalate rather than rewrite.

## Project Identity

**pixiv-token-getter (`ptg`) is the Pixiv credential lifecycle manager** —
a Node.js library + CLI that obtains, caches, refreshes and stores Pixiv
OAuth tokens, and drives browser / native PKCE / gppt login flows.

It is the ecosystem's **authentication facade**. It does not download,
schedule or publish anything — callers (PixivFlow, TelePost executor, CI)
ask it for a valid token and own the actual work.

Dividing line:

```
ptg       = Credentials / OAuth / Token lifecycle
callers   = Pixiv business logic
```

It is not:

- a Pixiv downloader or client
- a generic OAuth toolkit
- a place to implement PixivFlow business behavior

## Architecture

```
CLI / API consumer
        |
        v
 token lifecycle (refresh / cache / atomic store)
        |
        +-- auth providers: native PKCE / puppeteer browser / gppt
        +-- profile store (multiple Pixiv accounts)
        +-- proxy support
```

Entry points:

- library: `index.js` (+ `index.d.ts`)
- CLI: `cli.js` (bin names `pixiv-token-getter`, `ptg`)
- internals: `lib/auth/**`, `lib/browser/**`

## Rules

Allowed:

- OAuth / PKCE / token-exchange / TOTP logic
- token caching, refresh, atomic persistence, multi-profile management
- login flows (native browser, puppeteer, gppt interop)
- proxy handling for auth traffic

Must not:

- embed Pixiv download / scheduling / publishing logic
- log, print or commit raw tokens / refresh tokens / cookies
- weaken the atomic-write / secret-handling guarantees
- add features that belong in PixivFlow or TelePost

## Secrets

Pixiv tokens, refresh tokens, device tokens and cookies are secrets.

- never commit credential stores or example outputs containing real tokens
- keep storage paths out of the tracked tree (user home / env)
- in errors and logs, redact token values

## Compatibility

Public interfaces — treat as versioned contracts:

- the library API (`index.d.ts`)
- the CLI (`ptg`) flags and output
- stored token / profile file formats

Changes must consider backward compatibility, a migration path and release
notes (release-please drives the changelog).

## Development

- Node >= 22.12.0, ESM
- prefer small, incremental changes; evolve, don't replace
- update `docs/` (`API.md`, `CLI.md`, `USAGE.md`, migrations) with behavior
  changes; keep the bilingual (zh / en) docs in sync
- validate: tests / lint / `node --check` as applicable, and exercise the
  affected flow (token reuse → refresh → login).

## Commit Rules

- single-purpose, revertible, accurately described
- no drive-by cleanups or mixed refactors
- conventional-commit style, e.g. `feat(auth): ...`, `docs: ...`
