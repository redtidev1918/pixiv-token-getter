# Pixiv Token Getter

> **Node.js 的 Pixiv 凭据管理器与认证门面** —— 令牌缓存、refresh token 生命周期、多 profile，以及浏览器 / 原生登录，并可选支持 [gppt](https://github.com/eggplants/get-pixivpy-token) 互操作。

**简称：** `ptg`（CLI 命令别名）

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22.12.0-brightgreen)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[中文文档](./README.zh-CN.md) | [English](./README.md)

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

## 使用指南

### 原生登录

同一 provider 提供两种机制：

| `method` | 作用 | 适用场景 |
| --- | --- | --- |
| `oauth` / `browser` | 打开 Pixiv 登录页，**由你**登录。二者互为别名。 | 常规、最可靠（**推荐**） |
| `e2e` | 自动填写用户名 / 密码表单（默认无头） | 无人值守初始化；可能被判定为自动化 |

```bash
ptg login                          # 等价于 --method oauth
ptg login --method browser
PIXIV_USERNAME=user PIXIV_PASSWORD=pass ptg login --method e2e
```

旧参数继续可用，并映射到上述命令：

```bash
ptg --interactive              # → ptg login --method browser   （已弃用）
ptg --headless user pass       # → ptg login --method e2e       （已弃用）
ptg --interactive --output=f.json
```

### 刷新

```bash
ptg refresh                 # 刷新默认 profile 已存储的令牌
ptg refresh --profile main
```

```js
const { refreshToken, refreshStoredToken } = require('pixiv-token-getter');

// 刷新任意一个 refresh token（不涉及存储）：
const renewed = await refreshToken('the-refresh-token');

// 刷新某个 profile 已存储的令牌（显式刷新，即使仍然有效）：
const stored = await refreshStoredToken({ profile: 'main' });
```

**轮换已被正确处理。** Pixiv 可能返回一个*新的* refresh token；新值总会被持久化，空值绝不会覆盖一个有效值。

### 多 Profile

```bash
ptg configure --profile main --provider native --method oauth
ptg login     --profile main
ptg status    --profile main

ptg configure --list
```

```js
const token = await getToken({ profile: 'main' });
```

状态目录布局（XDG）：

```
$XDG_CONFIG_HOME/pixiv-token-getter/     （回退：~/.config/pixiv-token-getter/）
├── profiles/<name>.json          非敏感偏好（绝不保存密码）
├── tokens/<name>.token.json      密钥，0600，原子写入
└── browser/<name>/               持久化 Chrome profile，0700
```

从 `2.3` 升级时，旧的 `profile/` 目录会自动迁移到 `browser/default/`，因此已有登录状态得以保留。

### gppt 互操作（可选）

[gppt](https://github.com/eggplants/get-pixivpy-token) 是一个**可选的互操作 provider**，而不是依赖项。

```bash
pip install gppt
gppt configure
gppt login
```

之后可以在需要时导入其凭据（推荐）：

```bash
ptg import gppt
ptg import gppt --profile main --source-profile default
```

或者显式委托其登录：

```bash
ptg login --provider gppt
ptg login --provider gppt --method e2e    # 替你运行 `gppt login`
```

```js
await importGppt({ profile: 'main' });   // 读取 ~/.config/gppt/<profile>.token.json
```

我们**刻意不做**的事：

- ❌ 解析 gppt stdout / 用正则抓取密钥
- ❌ 要求 Python 才能使用核心功能
- ❌ 为 gppt 令牌伪造 `web_cookies`（见下文）

凭据查找顺序：`$GPPT_CONFIG_DIR` → `$XDG_CONFIG_HOME/gppt` → `~/.config/gppt`；文件名 `<profile>.token.json`（默认 profile 也接受裸 `.token.json`）。会对 `~` 做展开（gppt 自身并不会）。

### 网页 Cookie（`PHPSESSID`）

两种凭据，两种用途 —— 不要混用：

| 凭据 | 用途 | 来源 |
| --- | --- | --- |
| OAuth `access_token` | Pixiv **App API**（`app-api.pixiv.net`） | 任意 provider |
| `web_cookies.PHPSESSID` | Pixiv **网站 / 网页会话** | 仅原生浏览器登录 |

```js
const token = await getToken();
console.log(token.web_cookies); // { PHPSESSID: '...' } —— 仅原生
```

gppt 导入的令牌**没有** `web_cookies`：该字段被直接省略，而非伪造。刷新会保留已有 cookie（刷新响应本身不携带 cookie）。

### 代理

单一解析器同时作用于 **OAuth / 令牌请求**与 Puppeteer，浏览器与令牌交换永远不会不一致：

```bash
export HTTPS_PROXY=http://127.0.0.1:8080
ptg login
```

```js
await getToken({ proxy: 'http://user:pass@proxy:8080' });  // 显式指定
await getToken({ proxy: false });                          // 强制禁用代理
```

优先级：显式选项 → `ALL_PROXY` → `HTTPS_PROXY` → `HTTP_PROXY`。代理密码在所有日志与错误信息中都会被脱敏。

### 服务器 / 无头运行时（CI、Docker、Fly、Actions）

**不要**在服务器上执行登录。在本地登录一次，之后只刷新：

```js
const token = await getToken({ profile: 'main', refreshOnly: true });
```

`refreshOnly: true` 绝不会启动浏览器：若 refresh token 缺失 / 过期，它会抛出 `RefreshError`，让任务**明显地失败**，而不是循环启动 Chromium。

## API

### 高层 API（推荐）

| 函数 | 说明 |
| --- | --- |
| `getToken(options?)` | 缓存 → 刷新 → 登录，然后持久化 |
| `resolveToken(options?)` | 同 `getToken`，额外返回 `source`（`cache` / `refresh` / `login`） |
| `login(options?)` | 强制重新登录（`force: true`）并持久化 |
| `refreshStoredToken(options?)` | 刷新某个 profile 已存储的令牌 |
| `refreshToken(refreshToken, options?)` | 刷新任意 refresh token |
| `status(options?)` | 查看状态 —— **绝不**包含密钥 |
| `logout(options?)` | 删除凭据（`purge: true` 同时清除 profile 与浏览器数据） |
| `importGppt(options?)` | 导入 gppt 凭据 |
| `getProvider(id)` / `providerPlan(id)` | provider 选择（进阶） |

```js
const {
  getToken, login, refreshToken, refreshStoredToken,
  status, logout, importGppt,
  loadProfile, saveProfile, listProfiles,
  FileTokenStore, MemoryTokenStore,
} = require('pixiv-token-getter');
```

### Provider

```ts
interface AuthProvider {
  readonly id: string;
  readonly methods: AuthMethod[];
  login(options: LoginOptions): Promise<TokenInfo>;
  refresh?(refreshToken: string, options?: RefreshOptions): Promise<TokenInfo>;
  isAvailable?(): Promise<boolean>;
}
```

- `native` —— Puppeteer + PKCE。方法：`oauth` / `browser` / `e2e`。唯一能捕获网页 cookie 的 provider。
- `gppt` —— 可选。方法：`import`（读取令牌文件）/ `e2e`（运行 `gppt login`）。

**回退策略：** `provider: 'native'` 或 `'gppt'` 只使用该 provider —— 没有隐式回退。只有 `provider: 'auto'` 才会依次尝试 `[native, gppt]`，每个**至多一次**，并在确定的认证失败时停止。不会出现登录风暴。

### 令牌存储

```ts
interface TokenStore {
  load(profile: string): Promise<TokenInfo | null>;
  save(profile: string, token: TokenInfo): Promise<void>;
  remove(profile: string): Promise<void>;
}
```

`FileTokenStore` 是默认实现。写入是原子的（`写临时文件 → fsync → rename → chmod 0600`），因此被中断的进程绝不会留下空或写了一半的令牌文件，保存失败也会保留原凭据。`MemoryTokenStore` 用于测试 / 临时场景。

### `TokenInfo`

```ts
interface TokenInfo {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at?: string;   // 带时区的绝对 ISO-8601 —— 优先使用
  obtained_at?: string;  // 带时区的绝对 ISO-8601
  token_type?: string;
  scope?: string;
  user?: { id?: string; name?: string; account?: string };
  web_cookies?: Record<string, string>;  // 仅原生浏览器登录
  provider?: 'native' | 'gppt' | 'auto';
  method?: 'oauth' | 'browser' | 'e2e' | 'import';
  last_refreshed_at?: string;
}
```

辅助函数：`isTokenExpired(token, skewMs?)`（默认安全余量 **5 分钟**）、`msUntilExpiry(token)`、`normalizeTokenInfo(raw)`。

### 错误

通过 `error.code` 分支处理 —— 不要解析文案：

| 类 | `code` | 典型处理 |
| --- | --- | --- |
| `AuthError` | `AUTH_ERROR` | 基类 |
| `LoginError` | `LOGIN_ERROR` | 提示用户重新登录 |
| `TokenExchangeError` | `TOKEN_EXCHANGE_ERROR` | 退避重试 |
| `RefreshError` | `REFRESH_ERROR` | 需要重新登录 |
| `ProviderUnavailableError` | `PROVIDER_UNAVAILABLE` | 换 provider / 安装依赖 |
| `ProfileError` | `PROFILE_ERROR` | 修正配置 |
| `TokenStoreError` | `TOKEN_STORE_ERROR` | 磁盘 / 权限问题 |
| `TwoFactorRequiredError` | `TWO_FACTOR_REQUIRED` | 提示输入 TOTP 验证码 |

```js
const { RefreshError } = require('pixiv-token-getter');

try {
  await getToken({ refreshOnly: true });
} catch (error) {
  if (error instanceof RefreshError) notifyUserToLogInAgain();
  else throw error;
}
```

### 旧 API（仍然支持）

没有删除任何东西。以下函数保持原有签名：

```js
const {
  getTokenInteractive, getTokenHeadless,
  loginInteractive, loginHeadless,
  collectWebCookies, DEFAULT_USER_DATA_DIR,
} = require('pixiv-token-getter');
```

与 `2.3` 有两处有意的差异：

1. `DEFAULT_USER_DATA_DIR` 现在是 `.../browser/default`（自动迁移，无需操作）。
2. CLI 在输出中**遮蔽**令牌，而非直接打印；如确实需要原始值，请使用 `ptg token --show-secret`。

完整的分步指南见 [MIGRATION.md](./MIGRATION.md)。

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

## 安全

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

如有问题，请提交 [Issue](https://github.com/redtidev1918/pixiv-token-getter/issues)。
