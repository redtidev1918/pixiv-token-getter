# CLI reference

[中文](../CLI.md) · [Home](../../README.en.md) · [Guides](GUIDES.md)

`pixiv-token-getter` and `ptg` are equivalent commands. Run `ptg --help` for the options supported by your installed version.

| Command | Behavior |
| --- | --- |
| `ptg login [--profile NAME] [--provider native|gppt|auto] [--method oauth|browser|e2e|import]` | Force a fresh login and save the token |
| `ptg refresh [--profile NAME]` | Refresh a stored token |
| `ptg status [--profile NAME]` | Inspect state without returning secrets |
| `ptg token [--profile NAME]` | Show a masked token |
| `ptg configure [--profile NAME] [--provider ...] [--method ...] [--user-data-dir PATH] [--proxy URL]` | Save login preferences |
| `ptg configure --list` | List profiles |
| `ptg logout [--profile NAME] [--purge]` | Delete a token; `--purge` also removes preferences and browser data |
| `ptg import gppt [--profile NAME] [--source-profile NAME]` | Import a gppt token file |

Common options: `--json` emits JSON, `--quiet` suppresses progress messages, `--proxy URL` selects a proxy, and `--help` / `--version` show help and version. Login also accepts `--username`, `--password`, `--totp-code`, `--totp-secret`, `--timeout`, `--user-data-dir`, and `--output`. `--output` writes an additional legacy JSON file containing raw credentials; protect it. `--force` remains for compatibility; `ptg login` already starts a fresh login.

```sh
ptg login --profile main
PIXIV_USERNAME=user PIXIV_PASSWORD=pass ptg login --method e2e
ptg status --profile main --json
ptg token --profile main --show-secret
```

Tokens, refresh tokens, and cookies are masked by default, including in `--json` output. Use `--show-secret` with `ptg token` only when the raw value is needed, and keep its output out of logs.

| Exit code | Meaning |
| --- | --- |
| `0` | Success |
| `1` | Runtime error |
| `2` | Usage error |
| `3` | Provider unavailable |
| `4` | Missing or invalid credential state; for example, `ptg status` finds no token |

Environment variables: `PIXIV_USERNAME`, `PIXIV_PASSWORD` (e2e login), `PUPPETEER_EXECUTABLE_PATH` (browser executable), `PIXIV_TOKEN_GETTER_CONFIG_DIR` (state directory), `GPPT_CONFIG_DIR` (gppt credential directory), and `ALL_PROXY`, `HTTPS_PROXY`, `HTTP_PROXY` (proxies).

Legacy `--interactive` and `--headless <user> <pass>` flags still work but are deprecated. See the [migration guide](../../MIGRATION.en.md).
