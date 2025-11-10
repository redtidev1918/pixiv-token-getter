# Pixiv Token Getter

使用 Puppeteer 获取 Pixiv 登录 Token 的独立工具。

## 功能特点

- ✅ 支持交互式登录（打开浏览器窗口，手动登录）
- ✅ 支持无头登录（使用用户名密码自动登录）
- ✅ 基于 OAuth 2.0 PKCE 流程
- ✅ 自动保存 token 到 JSON 文件
- ✅ 跨平台支持（Windows、macOS、Linux）

## 安装

```bash
cd pixiv-token-getter
npm install
```

## 使用方法

### 查看帮助

```bash
node index.js --help
```

### 交互式登录（推荐）

打开浏览器窗口，手动完成登录：

```bash
# 方式 1: 显式指定交互式模式
node index.js --interactive

# 方式 2: 直接运行（默认使用交互式模式）
node index.js
```

### 无头登录

使用用户名和密码自动登录（不显示浏览器窗口）：

```bash
node index.js --headless <username> <password>
```

**注意**: 无头登录可能被 Pixiv 检测为自动化登录，如果失败请使用交互式登录。

### 指定输出文件

默认保存到 `pixiv-token.json`，可以使用 `--output` 参数指定输出路径：

```bash
node index.js --interactive --output=my-token.json
node index.js --headless username password --output=token.json
```

## 输出格式

工具会在当前目录生成一个 JSON 文件，包含以下信息：

```json
{
  "access_token": "...",
  "refresh_token": "...",
  "expires_in": 3600,
  "token_type": "bearer",
  "scope": "...",
  "user": {
    "id": "...",
    "name": "...",
    "account": "...",
    "profile_image_urls": {...}
  },
  "obtained_at": "2025-11-10T02:50:36.675Z"
}
```

## 注意事项

1. **交互式登录**：
   - 浏览器窗口会自动打开
   - 请在浏览器中完成登录流程
   - 登录成功后，浏览器窗口会自动关闭
   - 如果 5 分钟内未完成登录，会自动超时

2. **无头登录**：
   - 不显示浏览器窗口
   - 需要提供正确的用户名和密码
   - 如果登录失败，请尝试使用交互式登录

3. **Token 安全**：
   - 生成的 token 文件包含敏感信息，请妥善保管
   - 不要将 token 文件提交到版本控制系统
   - 建议将 token 文件添加到 `.gitignore`

## 依赖要求

- Node.js >= 16.0.0
- Puppeteer（会自动下载 Chromium，首次运行需要下载，可能需要一些时间）
- axios

## 安装步骤

1. 克隆或下载项目到本地
2. 进入项目目录：`cd pixiv-token-getter`
3. 安装依赖：`npm install`
4. 运行工具：`node index.js`

## 工作原理

本工具基于 OAuth 2.0 PKCE (Proof Key for Code Exchange) 流程：

1. 生成 `code_verifier` 和 `code_challenge`
2. 打开 Pixiv 登录页面，携带 PKCE 参数
3. 用户完成登录（交互式）或自动填写凭据（无头模式）
4. 从回调 URL 中提取授权码（authorization code）
5. 使用授权码和 `code_verifier` 交换 access token 和 refresh token
6. 将 token 信息保存到 JSON 文件

## 常见问题

### Q: 浏览器启动失败？

A: 确保系统已安装 Chrome 或 Chromium，或者让 Puppeteer 自动下载 Chromium。

### Q: 登录超时？

A: 交互式登录有 5 分钟的超时时间，如果网络较慢或需要完成验证码，请确保在时间内完成登录。

### Q: 无头登录失败？

A: Pixiv 可能会检测自动化登录，建议使用交互式登录方式。

### Q: 如何刷新 token？

A: 使用 `refresh_token` 可以通过 Pixiv API 刷新 `access_token`。本工具只负责获取初始 token。

## 许可证

MIT

