# Pixiv Token Getter

Node.js 的 Pixiv 凭据管理器。它负责登录、缓存、刷新和保存 OAuth 令牌；调用方负责自己的 Pixiv 业务逻辑。提供库 API 和 `ptg` 命令行工具。

[English](README.en.md) · [文档站](https://redtidev1918.github.io/pixiv-token-getter/) · [更新日志](CHANGELOG.md)

## 安装

需要 Node.js **22.12.0 或更新版本**。首次使用原生登录时，还需要本机已安装 Chrome 或 Chromium；`puppeteer-core` 不会下载浏览器。找不到浏览器时可设置 `PUPPETEER_EXECUTABLE_PATH`。

```sh
npm install pixiv-token-getter
```

如需在终端使用 `ptg`：

```sh
npm install -g pixiv-token-getter
```

## 快速开始

```sh
ptg login             # 打开浏览器登录，保存凭据
ptg status            # 查看状态，不显示密钥
ptg refresh           # 显式刷新已保存的令牌
```

在 Node.js 中获取可用令牌：

```js
const { getToken } = require('pixiv-token-getter');

const token = await getToken({ profile: 'default' });
// 将 token.access_token 传给你的 Pixiv App API 客户端。
```

`getToken()` 优先使用有效缓存，其次用已保存的 refresh token 刷新，最后才登录。`ptg login` 和库函数 `login()` 则会强制重新登录。

## 无人值守运行

先在本地完成登录，再把凭据安全地提供给运行环境。`refreshOnly` 会跳过浏览器登录，并**主动刷新**已保存的令牌，即使缓存仍然有效；缺少 refresh token 或刷新失败时会报错。

```js
const token = await getToken({ profile: 'default', refreshOnly: true });
```

## 凭据与安全

状态默认保存在 `~/.config/pixiv-token-getter/`，也可通过 `XDG_CONFIG_HOME` 或 `PIXIV_TOKEN_GETTER_CONFIG_DIR` 改变位置。`tokens/<profile>.token.json` 含密钥；请勿将其、CLI 的 `--output` 文件或浏览器 profile 提交到仓库。令牌写入采用原子替换；在支持 POSIX 权限的系统上，令牌文件权限为 `0600`。

CLI 默认遮蔽令牌和 Cookie；`ptg token --show-secret` 会显示原值，使用时避免把输出写入日志。`configure` 保存登录偏好，不保存密码。原生浏览器登录可能捕获 Pixiv 网页会话 Cookie；它与 App API 的 access token 用途不同。

## 继续阅读

| 需求 | 文档 |
| --- | --- |
| 登录方式、profile、代理、CI、gppt | [使用指南](docs/USAGE.md) |
| 命令与退出码 | [CLI 参考](docs/CLI.md) |
| 函数、类型与错误 | [API 参考](docs/API.md) |
| 从旧版本升级 | [迁移指南](MIGRATION.md) |

`gppt` 是可选的凭据互操作方案；普通使用无需 Python。问题与建议请到 [Issues](https://github.com/redtidev1918/pixiv-token-getter/issues)。
