## CLI reference

```
ptg login     [--profile] [--provider] [--method] [--username] [--password]
              [--totp-code] [--force] [--output=<file>] [--proxy] [--json] [--quiet]
ptg refresh   [--profile] [--json]
ptg status    [--profile] [--json]
ptg configure [--profile] [--provider] [--method] [--user-data-dir] [--proxy] [--list]
ptg logout    [--profile] [--purge]
ptg import gppt [--profile] [--source-profile] [--json]
ptg token     [--profile] [--json] [--show-secret]
ptg --help | --version
```

Exit codes: `0` ok · `1` error · `2` usage · `3` provider unavailable · `4` no/invalid credential state.

**Secret output policy.** `access_token`, `refresh_token` and `PHPSESSID` are **masked by default** (`********abcd`). `--json` is masked too; only an explicit `--show-secret` prints raw values. Credentials are never written to the terminal scrollback or CI logs by default.

**Environment variables**

| Variable | Purpose |
| --- | --- |
| `PIXIV_USERNAME` / `PIXIV_PASSWORD` | `--method e2e` credentials (keeps the password out of shell history) |
| `PIXIV_TOKEN_GETTER_CONFIG_DIR` | Override the whole state directory |
| `PIXIV_TOKEN_GETTER_GPPT_BIN` | Custom gppt executable (e.g. a venv shim) |
| `GPPT_CONFIG_DIR`, `XDG_CONFIG_HOME` | gppt config lookup |
| `ALL_PROXY` / `HTTPS_PROXY` / `HTTP_PROXY` | Proxy for both the browser and token requests |

