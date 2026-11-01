# API 参考

[English](en/API.md) · [首页](../README.md) · [使用指南](USAGE.md)

Node.js >= 22.12.0；包同时提供 `require()` 和 `import` 入口，类型声明见仓库根目录的 `index.d.ts`。

## 获取令牌

```js
const { getToken, resolveToken, refreshStoredToken, status } =
  require('pixiv-token-getter');

const token = await getToken({ profile: 'main' });
const result = await resolveToken({ profile: 'main' });
console.log(result.source); // cache | refresh | login

await refreshStoredToken({ profile: 'main' });
const state = await status({ profile: 'main' }); // 不含原始密钥
```

| 函数 | 行为 |
| --- | --- |
| `getToken(options?)` | 有效缓存 → 刷新 → 登录；返回 `TokenInfo` |
| `resolveToken(options?)` | 同上，返回 `{ token, source, providerId }` |
| `login(options?)` | 跳过缓存与刷新，强制登录并保存 |
| `refreshStoredToken(options?)` | 强制刷新已保存的令牌，即使 access token 仍有效 |
| `refreshToken(refreshToken, options?)` | 仅向 Pixiv 刷新；不读写 profile 存储 |
| `status(options?)` | 返回不含密钥的状态 |
| `logout({ profile?, purge? })` | 删除令牌；`purge` 还删除偏好和浏览器数据 |

常用 `getToken` 选项：

| 选项 | 含义 |
| --- | --- |
| `profile` | profile 名，默认 `default` |
| `provider` | `native`；默认使用 profile 偏好 |
| `method` | `oauth` / `browser` / `e2e` |
| `force` | 跳过缓存与刷新，重新登录 |
| `refreshOnly` | 不登录；主动刷新已保存的令牌，缺失或失败时报错 |
| `proxy` | 代理 URL；`false` 禁用代理 |
| `skewMs` | 过期安全余量，默认 5 分钟 |

`native` 是唯一 provider。其 `oauth` 与 `browser` 方法等价，打开浏览器让用户登录；`e2e` 自动填写凭据。

## 令牌形状

```ts
interface TokenInfo {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at?: string;
  obtained_at?: string;
  user?: { id?: string; name?: string; account?: string };
  web_cookies?: Record<string, string>;
  provider?: 'native';
  method?: 'oauth' | 'browser' | 'e2e';
}
```

`expires_at` 是带时区的绝对过期时间；使用 `isTokenExpired(token, skewMs?)` 或 `msUntilExpiry(token)` 判断有效期。网页 Cookie 只可能来自原生浏览器登录。

## Profile 与存储

`loadProfile(name?)`、`saveProfile(name, patch)`、`listProfiles()`、`removeProfile(name?)` 管理登录偏好。`FileTokenStore` 是默认令牌存储；`MemoryTokenStore` 可用于临时场景。文件存储原子替换令牌，POSIX 系统上使用 `0600` 权限。存储路径可由 `paths.getConfigDir()`、`paths.getTokenFilePath(profile)` 等辅助函数查询。

## 错误处理

通过 `error.code` 或错误类判断，不要解析错误文案：

| 错误类 | code |
| --- | --- |
| `AuthError` | `AUTH_ERROR` |
| `LoginError` | `LOGIN_ERROR` |
| `TokenExchangeError` | `TOKEN_EXCHANGE_ERROR` |
| `RefreshError` | `REFRESH_ERROR` |
| `ProviderUnavailableError` | `PROVIDER_UNAVAILABLE` |
| `ProfileError` | `PROFILE_ERROR` |
| `TokenStoreError` | `TOKEN_STORE_ERROR` |
| `TwoFactorRequiredError` | `TWO_FACTOR_REQUIRED` |

```js
const { getToken, RefreshError } = require('pixiv-token-getter');

try {
  await getToken({ refreshOnly: true });
} catch (error) {
  if (error instanceof RefreshError) {
    // 需要重新提供可用的 refresh token。
  } else {
    throw error;
  }
}
```

旧版 `getTokenInteractive()`、`getTokenHeadless()`、`loginInteractive()` 和 `loginHeadless()` 仍可用；新代码优先使用生命周期 API。升级细节见[迁移指南](../MIGRATION.md)。
