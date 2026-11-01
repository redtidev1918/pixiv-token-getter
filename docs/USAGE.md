# 使用指南

[English](en/GUIDES.md) · [首页](../README.md) · [CLI](CLI.md) · [API](API.md)

## 登录与令牌生命周期

安装 Node.js >= 22.12.0 和 Chrome/Chromium 后，运行：

```sh
npm install -g pixiv-token-getter
ptg login
ptg status
```

`ptg login` 每次都会重新登录。库函数 `getToken()` 则先读取有效缓存，再尝试刷新，最后才登录。想显式刷新已存储的令牌，可运行 `ptg refresh` 或调用 `refreshStoredToken()`。

| Provider | 方法 | 用途 |
| --- | --- | --- |
| `native`（默认） | `oauth` / `browser` | 打开浏览器，由用户完成登录；两者是别名 |
| `native` | `e2e` | 自动填写用户名、密码；可提供 TOTP 验证码 |
| `gppt`（可选） | `import` / `e2e` | 读取 gppt 凭据，或委托 gppt 登录 |

原生登录使用已安装的 Chrome/Chromium，不会自动下载。找不到浏览器时设置 `PUPPETEER_EXECUTABLE_PATH=/path/to/chrome`。`gppt` 只用于互操作；核心功能无需 Python。

## 多账号与存储

```sh
ptg login --profile main
ptg login --profile alt
ptg status --profile main
ptg configure --list
```

配置登录偏好：

```sh
ptg configure --profile main --provider native --method oauth
```

默认状态目录为 `~/.config/pixiv-token-getter/`；可用 `XDG_CONFIG_HOME` 或 `PIXIV_TOKEN_GETTER_CONFIG_DIR` 覆盖。目录下的 `profiles/` 存登录偏好，`tokens/` 存令牌，`browser/` 存浏览器数据。令牌文件按 profile 命名为 `<profile>.token.json`，请将整个状态目录保留在仓库外。文件原子写入；POSIX 系统上的令牌文件权限为 `0600`。

`ptg logout --profile main` 删除该 profile 的令牌；加 `--purge` 还会删除其偏好与浏览器数据。

## 无人值守运行

先在本地登录，再通过受控方式将凭据文件交给运行环境。使用 `refreshOnly` 时不会启动浏览器，且会主动刷新，即使缓存中的 access token 尚未过期：

```js
const { getToken } = require('pixiv-token-getter');
const token = await getToken({ profile: 'main', refreshOnly: true });
```

缺少 refresh token 或刷新失败会报错。仅需复用有效缓存时调用普通 `getToken()`，但它在刷新失败后可能尝试登录，不适合无人值守环境。

## 网页 Cookie

OAuth `access_token` 用于 Pixiv App API；`web_cookies.PHPSESSID` 是 Pixiv 网站的会话 Cookie。只有原生浏览器登录可能捕获网页 Cookie。gppt 导入的令牌没有这一字段；刷新会保留已存的 Cookie。两类凭据都属于密钥，不要打印或提交到仓库。

## 代理

显式设置优先于环境变量；环境变量依次读取 `ALL_PROXY`、`HTTPS_PROXY`、`HTTP_PROXY`（也支持小写）。同一代理解析结果用于浏览器与令牌请求。

```sh
HTTPS_PROXY=http://127.0.0.1:8080 ptg login
ptg login --proxy=http://127.0.0.1:8080
```

```js
await getToken({ proxy: 'http://127.0.0.1:8080' });
await getToken({ proxy: false }); // 禁用代理
```

## gppt 凭据导入

gppt 是[独立的 Python 工具](https://github.com/eggplants/get-pixivpy-token)，**不是 ptg 的依赖**。不安装它不会影响 `ptg login`、`ptg refresh` 或库的 `getToken()` 原生流程。

| 操作 | 需要 Python / gppt 吗？ |
| --- | --- |
| 原生登录、缓存、刷新 | 不需要 |
| `ptg import gppt` 读取已有令牌文件 | 不需要运行 Python；需要先有该文件 |
| `ptg login --provider gppt --method e2e` 委托 gppt 登录 | 需要安装 Python 和 gppt |

如果已经有 gppt 令牌文件，可以直接导入：

```sh
ptg import gppt --profile main --source-profile default
```

ptg 不解析 gppt 的终端输出，而是读取其凭据文件。`GPPT_CONFIG_DIR` 可指定 gppt 配置目录。

## 旧版本

`ptg --interactive` 和 `ptg --headless <user> <pass>` 仍受支持，但已弃用。升级文件格式及旧浏览器数据迁移见[迁移指南](../MIGRATION.md)。
