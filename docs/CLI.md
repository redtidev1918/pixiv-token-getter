# CLI 参考

[English](en/CLI.md) · [首页](../README.md) · [使用指南](USAGE.md)

`pixiv-token-getter` 与 `ptg` 是同一个命令。运行 `ptg --help` 查看当前版本支持的参数。

| 命令 | 行为 |
| --- | --- |
| `ptg login [--profile NAME] [--provider native] [--method oauth|browser|e2e]` | 强制重新登录并保存令牌 |
| `ptg refresh [--profile NAME]` | 刷新已保存的令牌 |
| `ptg status [--profile NAME]` | 查看状态，不返回密钥 |
| `ptg token [--profile NAME]` | 显示遮蔽后的令牌 |
| `ptg configure [--profile NAME] [--provider ...] [--method ...] [--user-data-dir PATH] [--proxy URL]` | 保存登录偏好 |
| `ptg configure --list` | 列出 profile |
| `ptg logout [--profile NAME] [--purge]` | 删除令牌；`--purge` 也删除偏好和浏览器数据 |

常用选项：`--json` 输出 JSON，`--quiet` 抑制进度消息，`--proxy URL` 指定代理，`--help` / `--version` 查看帮助与版本。登录还支持 `--username`、`--password`、`--totp-code`、`--totp-secret`、`--timeout`、`--user-data-dir` 和 `--output`。`--output` 另写一份含原始密钥的旧格式 JSON，请妥善保护。`--force` 为兼容选项；`ptg login` 本身就会重新登录。

```sh
ptg login --profile main
PIXIV_USERNAME=user PIXIV_PASSWORD=pass ptg login --method e2e
ptg status --profile main --json
ptg token --profile main --show-secret
```

令牌、refresh token 和 Cookie 默认遮蔽，`--json` 也如此。只有在确实需要原值时才对 `ptg token` 使用 `--show-secret`；避免把输出写入日志。

| 退出码 | 含义 |
| --- | --- |
| `0` | 成功 |
| `1` | 运行错误 |
| `2` | 参数错误 |
| `3` | Provider 不可用 |
| `4` | 凭据状态缺失或无效；例如 `ptg status` 找不到令牌 |

相关环境变量：`PIXIV_USERNAME`、`PIXIV_PASSWORD`（e2e 登录），`PUPPETEER_EXECUTABLE_PATH`（浏览器路径），`PIXIV_TOKEN_GETTER_CONFIG_DIR`（状态目录），以及 `ALL_PROXY`、`HTTPS_PROXY`、`HTTP_PROXY`（代理）。

旧参数 `--interactive` 和 `--headless <user> <pass>` 仍支持，但已弃用。升级说明见[迁移指南](../MIGRATION.md)。
