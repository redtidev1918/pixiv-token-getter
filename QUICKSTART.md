# 快速开始指南

## 1. 安装依赖

```bash
npm install
```

## 2. 运行工具

### 方式 1: 交互式登录（推荐）

```bash
node index.js
```

浏览器窗口会自动打开，请在浏览器中完成登录。

### 方式 2: 无头登录

```bash
node index.js --headless <your-username> <your-password>
```

## 3. 获取 Token

登录成功后，token 会保存到 `pixiv-token.json` 文件中。

## 4. 使用 Token

生成的 JSON 文件包含：
- `access_token`: 访问令牌
- `refresh_token`: 刷新令牌（用于获取新的 access_token）
- `user`: 用户信息

## 示例输出

```json
{
  "access_token": "xxxxx",
  "refresh_token": "xxxxx",
  "expires_in": 3600,
  "token_type": "bearer",
  "scope": "read write",
  "user": {
    "id": "123456",
    "name": "your-username",
    "account": "your-account",
    "profile_image_urls": {
      "px_16x16": "...",
      "px_50x50": "...",
      "px_170x170": "..."
    }
  },
  "obtained_at": "2025-11-10T02:50:36.675Z"
}
```

## 注意事项

- Token 文件包含敏感信息，请妥善保管
- 不要将 token 文件提交到 Git 仓库
- 如果登录失败，请检查网络连接或尝试使用交互式登录

