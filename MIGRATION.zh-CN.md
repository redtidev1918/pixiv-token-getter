# 迁移指南

[中文文档](./MIGRATION.zh-CN.md) | [English](./MIGRATION.md)

**从 `2.3.x` → `2.4.x`**

`2.4.0` 把这个包从*一次性 token 抓取器*升级为一个**凭据管理器**。这是一个**无破坏性变更**的 minor 版本：没有删除任何东西，每个旧导出都保留原有签名。本指南覆盖少量行为变化，并展示推荐的新 API。

如果你只用了 `getTokenInteractive()` / `getTokenHeadless()` 以及 `--interactive` / `--headless` CLI 参数，**你不需要改动任何东西** —— 但请阅读第 2 节与第 3 节，其中包含两处有意的行为差异。

---

## 1. 推荐：迁移到生命周期 API

旧辅助函数总是执行一次**登录**。新的 `getToken()` 会先复用缓存令牌，然后刷新，最后才登录。对任何需要运行多次的场景来说，这是最有价值的一处改动。

```js
// Before (2.3) — logs in every time
const { getTokenInteractive } = require('pixiv-token-getter');
const token = await getTokenInteractive();

// After (2.4) — cache → refresh → login, then persist. Log in once, reuse forever.
const { getToken } = require('pixiv-token-getter');
const token = await getToken({ profile: 'default' });
```

两者都仍然可用。旧调用现在是一个强制浏览器登录的薄封装，因此只有当你*确实想要*一次全新的交互式登录时，它才是正确选择。

### API 映射

| 2.3 | 2.4（推荐） | 说明 |
| --- | --- | --- |
| `getTokenInteractive(opts)` | `getToken(opts)` | 生命周期；要保留旧的"总是登录"行为，请加 `force: true` |
| `getTokenHeadless({ username, password })` | `getToken({ method: 'e2e', username, password })` 或 `login(...)` | 同样的自动化，但现在带缓存 / 可刷新 |
| — | `refreshToken(value)` | 刷新任意一个 refresh token |
| — | `refreshStoredToken({ profile })` | 刷新某个 profile 已存储的令牌 |
| — | `resolveToken(opts)` | 类似 `getToken`，并额外告诉你 `source` |
| — | `status({ profile })` | 查看状态，且不含密钥 |
| — | `logout({ profile })` | 删除一份凭据 |
| — | `importGppt({ profile })` | 导入一份 gppt 凭据 |

`loginInteractive()` / `loginHeadless()` 仍然导出且签名不变；`getTokenInteractive` / `getTokenHeadless` 现在只是它们的别名。

---

## 2. 行为变化：`DEFAULT_USER_DATA_DIR`

默认的持久化浏览器 profile 迁移到了按 profile 划分的目录下：

```
2.3:  ~/.config/pixiv-token-getter/profile
2.4:  ~/.config/pixiv-token-getter/browser/default
```

**无需任何操作。** 首次使用时，`2.4.0` 会自动把旧的 `profile/` 目录迁移到 `browser/default/`，因此已有登录状态可以安全升级。如果你硬编码了旧的绝对路径，请更新它 —— 但更好的做法是显式传入 `userDataDir`，或使用 `paths` 辅助函数：

```js
const { paths } = require('pixiv-token-getter');
paths.getBrowserDir('default'); // .../browser/default
```

---

## 3. 行为变化：CLI 会遮蔽密钥

在 `2.3` 中，`ptg --interactive` 会打印原始的 `access_token` / `refresh_token`。在 `2.4` 中，密钥**默认被遮蔽**（`********abcd`）—— 人类可读输出*与* `--json` 皆然 —— 以避免凭据泄漏到终端回滚缓冲、CI 日志与屏幕共享中。

如果你的脚本通过解析 stdout 来读取令牌，**请停止这样做** —— 它既脆弱，现在又已被遮蔽。请改用以下受支持、稳定的接口：

```bash
# machine-readable, from the store (still masked)
ptg token --json

# explicitly print the raw value (opt-in)
ptg token --show-secret

# or read the store directly from your program
```

```js
const { FileTokenStore } = require('pixiv-token-getter');
const token = await new FileTokenStore().load('default');
```

---

## 4. CLI 迁移

命令名是新的；旧参数**被保留并标记为已弃用**，因此现有脚本可以继续工作。

| 2.3 | 2.4 | 状态 |
| --- | --- | --- |
| `ptg --interactive` | `ptg login` / `ptg login --method browser` | 已弃用别名，仍然可用 |
| `ptg --headless u p` | `ptg login --method e2e --username u --password p` | 已弃用别名，仍然可用 |
| `ptg --interactive --output=f.json` | `ptg login --output=f.json` | 仍然可用 |
| `npm start` | `ptg login` | `npm start` 仍会运行 CLI |

新命令：

```bash
ptg login      # cache → refresh → login, then persist
ptg refresh    # refresh the stored token
ptg status     # inspect (never prints secrets)
ptg configure  # save non-secret profile preferences
ptg logout     # remove stored credentials (--purge also clears profile + browser)
ptg import gppt
ptg token      # print the stored token (masked unless --show-secret)
```

**退出码**现在稳定且在 CI 中很实用：
`0` 成功 · `1` 错误 · `2` 用法错误 · `3` provider 不可用 · `4` 无 / 无效凭据状态。

---

## 5. 错误处理：通过 `error.code` 分支

`2.3` 抛出的是带描述性文案的普通 `Error`。`2.4` 增加了带稳定 `code` 的错误类。文案仍然人类可读，但请改用类型 / code 判断：

```js
const { RefreshError, LoginError } = require('pixiv-token-getter');

try {
  await getToken({ refreshOnly: true });
} catch (error) {
  if (error instanceof RefreshError) {
    // refresh token missing/expired → re-login is required
  } else if (error instanceof LoginError) {
    // user action needed
  } else {
    throw error;
  }
}
```

| 类 | `code` |
| --- | --- |
| `AuthError` | `AUTH_ERROR` |
| `LoginError` | `LOGIN_ERROR` |
| `TokenExchangeError` | `TOKEN_EXCHANGE_ERROR` |
| `RefreshError` | `REFRESH_ERROR` |
| `ProviderUnavailableError` | `PROVIDER_UNAVAILABLE` |
| `ProfileError` | `PROFILE_ERROR` |
| `TokenStoreError` | `TOKEN_STORE_ERROR` |
| `TwoFactorRequiredError` | `TWO_FACTOR_REQUIRED` |

---

## 6. 令牌形状：仅新增可选字段

`TokenInfo` 增加了**可选**字段。既有字段未变，因此旧代码可以继续工作：

```ts
interface TokenInfo {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type?: string;
  scope?: string;
  user?: { id?: string; name?: string; account?: string };
  // new in 2.4 (all optional):
  expires_at?: string;       // absolute ISO-8601 WITH timezone — prefer this over expires_in
  obtained_at?: string;
  web_cookies?: Record<string, string>;
  provider?: 'native' | 'gppt' | 'auto';
  method?: 'oauth' | 'browser' | 'e2e' | 'import';
  last_refreshed_at?: string;
}
```

优先使用 `expires_at`，而不是自行计算 `Date.now() + expires_in * 1000`：它是绝对值、带时区，并且能跨进程重启保持正确。

```js
const { isTokenExpired } = require('pixiv-token-getter');
isTokenExpired(token);        // default 5-minute safety skew
isTokenExpired(token, 0);     // no skew
```

---

## 7. 新增能力（可安全采用）

- **Profiles** —— `profiles/<name>.json`、`tokens/<name>.token.json`、`browser/<name>/`。
  使用 `ptg configure --profile main` 与 `getToken({ profile: 'main' })`。
- **刷新** —— `refreshToken()` / `refreshStoredToken()`，轮换安全。
- **原子化存储** —— 写入依次经过临时文件 → `fsync` → `rename` → `chmod 0600`。
- **Provider** —— `native`（默认）、`gppt`（可选）、`auto`（受控回退）。
- **gppt 互操作** —— `ptg import gppt` 读取 gppt 的结构化令牌文件；
  它绝不解析 stdout，其它任何环节也不需要 Python。
- **网页 Cookie** —— `token.web_cookies.PHPSESSID` 仅来自原生浏览器登录。
- **代理** —— 浏览器与令牌请求共用同一个解析器。

---

## 8. 检查清单

- [ ] 在你只需要令牌的地方，把 `getTokenInteractive()` 替换为 `getToken()`。
- [ ] 停止解析 CLI stdout 来获取令牌；改用库或 `ptg token --json`。
- [ ] 把错误处理切换为 `error.code` / 错误类。
- [ ] 优先使用 `expires_at`，而不是在内存里对 `expires_in` 做计算。
- [ ] 如果你硬编码了 `.../profile`，改用 `paths.getBrowserDir(profile)`。
- [ ] 服务器 / CI 场景请使用 `getToken({ refreshOnly: true })`，永远不要在那些环境里登录。
- [ ] 把 `*.token.json`、`pixiv-token.json`、`.config/pixiv-token-getter/` 加入 `.gitignore`。

---

## 需要完全一致的老行为？

一切都一一对应：

```js
// 2.3 interactive, verbatim behavior
const token = await getTokenInteractive({ timeout: 300000 });

// 2.4 equivalent (forced fresh login, browser)
const token = await getToken({ method: 'browser', force: true, timeout: 300000 });

// 2.3 headless, verbatim behavior
const token = await getTokenHeadless({ username, password });

// 2.4 equivalent (forced fresh login, automated)
const token = await getToken({ method: 'e2e', force: true, username, password });
```

如果遇到本指南未覆盖的情况，请提交一个
[issue](https://github.com/redtidev1918/pixiv-token-getter/issues)。
