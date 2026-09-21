# Pixiv Token Getter

> **Node.js 的 Pixiv 凭据管理器与认证门面** —— 令牌缓存、refresh token 生命周期、多 profile，以及浏览器 / 原生登录，并可选支持 [gppt](https://github.com/eggplants/get-pixivpy-token) 互操作。

**简称：** `ptg`（CLI 命令别名）

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22.12.0-brightgreen)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Docs](https://img.shields.io/badge/Docs-文档站点-6366f1?style=flat-square)](https://redtidev1918.github.io/pixiv-token-getter/)

**语言 / Language:** 中文 · [English](README.en.md)

📖 [完整文档](https://redtidev1918.github.io/pixiv-token-getter/)

---

## 这是什么（以及变化了什么）

这个包以前是"一次性获取 token"的工具，现在是一个**凭据生命周期管理器**：

```
缓存令牌 ──有效──▶ 直接复用
      │
      ├── 存在 refresh_token ──▶ 刷新 ──▶ 原子写入 ──▶ 使用
      │
      └── 否则 ──▶ 登录（原生浏览器 / 原生 PKCE / gppt）──▶ 原子写入 ──▶ 使用
```

你不再需要每次都重新登录。**在本地登录一次**，生产 / CI 运行时只需要刷新即可。

```js
const { getToken } = require('pixiv-token-getter');

// 缓存 → 刷新 → 登录，然后持久化。推荐的入口。
const token = await getToken({ profile: 'default' });
```

## 特性

- ✅ **凭据生命周期** —— `getToken()` 缓存 → 刷新 → 登录，并持久化绝对过期时间
- ✅ **Refresh token 支持** —— `refreshToken()`、`refreshStoredToken()`，且**轮换安全**
- ✅ **多 profile** —— `--profile main`、`--profile alt`；令牌、偏好与浏览器数据相互隔离
- ✅ **原生 PKCE OAuth** —— 原有的第一方实现（保留并重构，而非替换）
- ✅ **Puppeteer 浏览器登录** —— 支持交互式 *与* 自动化（`e2e`），可选 TOTP 二次验证
- ✅ **持久化浏览器 profile** —— 通常多次运行之间保持已登录状态
- ✅ **网页会话 Cookie** —— 为 Pixiv **网页**抓取捕获 `PHPSESSID`（仅原生 provider）
- ✅ **gppt 互操作（可选）** —— 导入 gppt 凭据，**无需任何 Python 依赖**
- ✅ **原子化、0600 权限的凭据存储** —— 写入失败绝不会截断一个可用的令牌
- ✅ **稳定错误模型** —— 通过 `error.code` 分支处理，而非解析错误文案
- ✅ **TypeScript 类型** —— 新 API 与旧 API 均有完整 `.d.ts`

## 安装

```bash
npm install pixiv-token-getter
```

> **不需要 Python。** `gppt` 只是*可选的*适配器，原生 provider 可独立工作。

## 快速开始

### CLI

```bash
npm install -g pixiv-token-getter

ptg login        # 首次：打开 Pixiv 登录页，保存 refresh token
ptg status       # 之后：查看状态（绝不会打印密钥）
```

首次登录成功：

```
[+] Logged in as your_name (ID: 123456)
    Profile:        default
    Provider:       native (oauth)
    Access token:   ********cd12
    Refresh token:  ********ab34
    Expires at:     2026-09-11T12:34:56.000Z (in 59m)
    Web session:    PHPSESSID available
[+] Refresh token saved securely.
```

```
$ ptg status
Profile:        default
Provider:       native (oauth)
User:           your_name (ID: 123456)
Access token:   valid (expires 2026-09-11T12:34:56.000Z)
Expires in:     58m
Refresh token:  present
Web session:    PHPSESSID available
Token file:     ~/.config/pixiv-token-getter/tokens/default.token.json
```

### 作为库使用

```js
const { getToken } = require('pixiv-token-getter');

const token = await getToken({
  profile: 'default',
  provider: 'native',   // native | gppt | auto   （默认：native）
  method: 'oauth',      // oauth | browser | e2e | import
  force: false,         // true → 跳过缓存与刷新，重新登录
});
```

这就是全部集成。`PixivFlow`（以及任何其它 Node 使用方）只需要这一个调用。

## 安全

## 文档

README 只留入口；用法、API 与命令细节在[文档站](https://redtidev1918.github.io/pixiv-token-getter/)：

| 你想做什么 | 文档 |
| --- | --- |
| 登录、刷新、多 Profile、网页 Cookie、代理 | [使用指南](docs/USAGE.md) |
| 在代码里调用 | [API](docs/API.md) |
| 查命令行参数 | [CLI 参考](docs/CLI.md) |

- 密钥保存在 `tokens/<profile>.token.json`，权限为 **`0600`**；目录为 **`0700`**。
- 写入是原子的；登录 / 刷新失败会**保留原有的令牌文件**。
- 默认**绝不**持久化密码（`configure` 只保存非敏感偏好）。
- TOTP 密钥为**可选**（`--totp-secret` / `totpSecret`），不会被自动保存。
- 抛出的错误与日志输出中不包含令牌值；HTTP 错误响应体会被脱敏。
- gppt stdout **绝不**被持久化或解析。
- 代理凭据会被脱敏（`http://user:***@host`）。
- Windows 上没有 POSIX `chmod`：文件继承用户私有目录的 ACL，因此我们将状态保存在 `%USERPROFILE%` 下。

请将这些加入你的 `.gitignore`：`pixiv-token.json`、`*.token.json`、`.config/pixiv-token-getter/`。

## 要求

- **Node.js >= 22.12.0**（与 `package.json#engines` 一致）
- Puppeteer（作为依赖安装；Chromium 会自动下载）
- *可选：* Python + `gppt`，仅在需要 gppt 互操作 provider 时

## 致谢

凭据生命周期设计（profile → 缓存令牌 → 有效性 → 刷新 → 回退登录，以及 `expires_at` 处理、profile 概念与 OAuth/E2E 拆分）**受** [eggplants/get-pixivpy-token (gppt)](https://github.com/eggplants/get-pixivpy-token) **启发**，后者为 MIT 许可。未复制任何 gppt 源码；Node.js 实现为原创。详见 [ACKNOWLEDGMENTS.md](./ACKNOWLEDGMENTS.md)。

## 常见问题

**需要 Python 吗？** 不需要。仅当你明确想使用 gppt 互操作 provider（`ptg import gppt` / `--provider gppt`）时才需要。

**令牌会过期吗？** 会。`access_token` 是短期的；`getToken()` 会用存储的 `refresh_token` 自动刷新。

**为什么推荐 `getToken()` 而不是 `getTokenInteractive()`？** 旧辅助函数总是执行一次登录。`getToken()` 会优先复用缓存，其次刷新，最后才登录。

**refresh token 会轮换吗？** 可能会。新的 refresh token 总会被持久化；空响应绝不会覆盖有效值。

**可以在 CI 中使用吗？** 可以 —— 在本地保存凭据，然后使用 `getToken({ refreshOnly: true })`。切勿在 CI 中登录。

**`PHPSESSID` 和 access token 是一回事吗？** 不是。access token 用于 App API；`PHPSESSID` 用于 Pixiv 网站会话。只有原生浏览器登录才能产生它。

## 相关链接

- [Pixiv API 文档](https://www.pixiv.net/help/article/3629)
- [Puppeteer 文档](https://pptr.dev/)
- [gppt（可选互操作）](https://github.com/eggplants/get-pixivpy-token)
- [迁移指南](./MIGRATION.md)
- [致谢](./ACKNOWLEDGMENTS.md)

如有问题，请提交 [Issue](https://github.com/redtidev1918/pixiv-token-getter/issues)。
