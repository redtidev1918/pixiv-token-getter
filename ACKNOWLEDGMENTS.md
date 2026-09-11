# 致谢

**语言 / Language:** 中文 · [English](./ACKNOWLEDGMENTS.en.md)

`pixiv-token-getter` 站在少数几个优秀开源项目的肩膀上。本文件记录了**我们借鉴了什么** —— 同样重要的是，也记录了**我们刻意没有做什么**。

---

## gppt —— `eggplants/get-pixivpy-token`

- **项目：** https://github.com/eggplants/get-pixivpy-token
- **许可证：** MIT
- **它是什么：** 一个 Python 工具，通过无头浏览器或设备码（device-code）风格的流程获取 Pixiv 凭据（OAuth 令牌与 refresh token），并把它们保存到结构化的令牌文件中。

### 我们有意借鉴的部分（设计，而非代码）

`pixiv-token-getter` 2.4.0 的**凭据生命周期模型**是通过研究 gppt（v5）设计出来的。具体采纳了以下*思路*：

- **每个 profile 一个凭据存储**，配合后台 CLI 登录以及机器可读的 `access_token` / `refresh_token` 记录。
- **有效性窗口：** 保存*绝对*过期时间，并把接近过期的令牌视作已过期（安全余量），而不是跨进程重启去信任 `expires_in` 的算术。
- **先刷新、后登录：** 缓存令牌有效就复用，否则刷新，只有在无法刷新时才回退到交互式登录。
- **OAuth 与 E2E 分离**的登录方式：日常使用由用户驱动浏览器登录，无人值守初始化则走自动化的用户名 / 密码流程。
- **profile 概念**，让多个 Pixiv 账号可以共存。
- **以文件契约实现互操作：** gppt 的令牌文件是一个稳定且有文档说明的边界，让我们无需依赖 Python 包即可读取。

### 我们刻意没有做的事

- **没有复制任何 gppt 源码。** Node.js 实现（PKCE、Puppeteer 流程、存储、provider 层）均为原创工作。
- **不硬依赖 gppt 或 Python。** gppt 是一个*可选*的互操作 provider。`npm install pixiv-token-getter` 永远不会安装或要求 Python，原生 provider 可完全独立工作。
- **我们绝不解析 gppt 的 stdout。** 导入 gppt 凭据只读取其结构化令牌文件（`<profile>.token.json`）—— 从控制台输出里抓取密钥既脆弱又不安全。
- **我们绝不为 gppt 导入的令牌伪造 `web_cookies`。** gppt 凭据携带的是 App API 令牌，而不是网站会话。该字段被直接省略，而不是填入一个假值。

### 文件格式兼容性

`ptg import gppt` 按以下顺序查找 gppt 的凭据文件：

1. `$GPPT_CONFIG_DIR`
2. `$XDG_CONFIG_HOME/gppt`
3. `~/.config/gppt`

文件名为 `<profile>.token.json`（默认 profile 也接受裸 `.token.json`）。我们会自行展开 `~`，因为 gppt 不会。

---

## 其他灵感来源

- **[Puppeteer](https://pptr.dev/)** —— Apache-2.0 —— 无头浏览器自动化。
- **[axios](https://axios-http.com/)** —— MIT —— 令牌端点的 HTTP 传输。
- **Pixiv 的 OAuth2 + PKCE 流程** —— 社区记录的公开客户端流程；这里使用的常量是第三方客户端沿用多年的长期公开应用凭据。

---

## 本仓库中的归属说明

- [`README.md`](./README.md) / [`README.en.md`](./README.en.md) —— 致谢章节指回此处与 gppt。
- [`LICENSE`](./LICENSE) —— 本项目自身的许可证（MIT），与 gppt 一致。

如果你认为此处存在归属错误，请提交一个
[issue](https://github.com/redtidev1918/pixiv-token-getter/issues)，我们会予以更正。
