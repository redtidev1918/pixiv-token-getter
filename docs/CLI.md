## CLI 参考

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

退出码：`0` 成功 · `1` 错误 · `2` 用法错误 · `3` provider 不可用 · `4` 无 / 无效凭据状态。

**密钥输出策略。** `access_token`、`refresh_token` 与 `PHPSESSID` **默认被遮蔽**（`********abcd`）。`--json` 同样遮蔽；只有显式 `--show-secret` 才会打印原始值。默认情况下凭据绝不会写入终端回滚缓冲或 CI 日志。

**环境变量**

| 变量 | 用途 |
| --- | --- |
| `PIXIV_USERNAME` / `PIXIV_PASSWORD` | `--method e2e` 凭据（避免密码进入 shell 历史） |
| `PIXIV_TOKEN_GETTER_CONFIG_DIR` | 覆盖整个状态目录 |
| `PIXIV_TOKEN_GETTER_GPPT_BIN` | 自定义 gppt 可执行文件（例如 venv 包装脚本） |
| `GPPT_CONFIG_DIR`、`XDG_CONFIG_HOME` | gppt 配置查找 |
| `ALL_PROXY` / `HTTPS_PROXY` / `HTTP_PROXY` | 浏览器与令牌请求共用的代理 |

