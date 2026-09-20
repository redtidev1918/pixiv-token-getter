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

