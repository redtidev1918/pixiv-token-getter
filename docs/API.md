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

