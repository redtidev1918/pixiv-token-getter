# 认证与令牌生命周期

[English](en/ARCHITECTURE.md) · [首页](../README.md)

`ptg` 只管理 Pixiv 凭据。CLI 和库 API 共用 `lib/auth/token/lifecycle.js`：先读取 profile，再选择原生认证；`getToken()` 按缓存 → 刷新 → 登录处理，`login()` 强制新登录，`refreshStoredToken()` 只刷新。

原生 provider 用 PKCE 与 Pixiv OAuth 交换令牌，浏览器登录可额外捕获网站 Cookie。刷新保留已有 Cookie，并在响应未提供新 refresh token 时保留旧值。`FileTokenStore` 按 profile 原子写入令牌；profile 偏好和浏览器数据分别存放。代理解析结果用于浏览器和令牌请求。

旧 profile 的 gppt/auto/import 偏好在读取时映射为 native/oauth；已有 ptg 令牌文件保持可用。外部调用方负责 Pixiv 业务逻辑。见[迁移指南](../MIGRATION.md)。
