# Pixiv Token Getter (ptg) / Pixiv Token 获取工具

> A standalone CLI tool to get Pixiv login tokens using Puppeteer  
> 使用 Puppeteer 获取 Pixiv 登录 Token 的独立 CLI 工具

---

## Quick Start / 快速开始

### Installation / 安装

```bash
npm install
```

### Global Installation / 全局安装（可选）

```bash
npm install -g
```

After global installation, you can use `pixiv-token-getter` or `ptg` command directly.  
全局安装后，可以直接使用 `pixiv-token-getter` 或 `ptg` 命令。

### Usage / 使用方法

**Interactive Login (Recommended) / 交互式登录（推荐）**

```bash
# Using node directly / 直接使用 node
node index.js

# Or using npm script / 或使用 npm 脚本
npm start

# Or if installed globally / 或全局安装后
pixiv-token-getter
# or
ptg
```

A browser window will open. Complete the login in the browser.  
浏览器窗口会自动打开，请在浏览器中完成登录。

**Headless Login / 无头登录**

```bash
node index.js --headless <username> <password>
# or
ptg --headless <username> <password>
```

**Note / 注意**: Headless login may fail due to Pixiv's bot detection. Use interactive login if it fails.  
无头登录可能被 Pixiv 检测为自动化登录，如果失败请使用交互式登录。

---

## Output / 输出

Token is saved to `pixiv-token.json` by default.  
Token 默认保存到 `pixiv-token.json` 文件。

```json
{
  "access_token": "...",
  "refresh_token": "...",
  "expires_in": 3600,
  "token_type": "bearer",
  "user": {
    "id": "...",
    "name": "...",
    "account": "..."
  },
  "obtained_at": "2025-11-10T02:50:36.675Z"
}
```

---

## Options / 选项

- `--interactive` - Interactive login mode (default)  
  交互式登录模式（默认）

- `--headless <username> <password>` - Headless login mode  
  无头登录模式

- `--output <path>` - Specify output file path  
  指定输出文件路径

- `--help` - Show help message  
  显示帮助信息

## Command Aliases / 命令别名

After global installation, you can use either:  
全局安装后，可以使用以下任一命令：

- `pixiv-token-getter` - Full command name / 完整命令名
- `ptg` - Short alias / 简短别名

---

## Requirements / 依赖要求

- Node.js >= 16.0.0
- Puppeteer (Chromium will be downloaded automatically)  
  Puppeteer（会自动下载 Chromium）

---

## Notes / 注意事项

- ⚠️ Token files contain sensitive information. Keep them secure.  
  Token 文件包含敏感信息，请妥善保管。

- ⚠️ Do not commit token files to version control.  
  不要将 token 文件提交到版本控制系统。

- ⚠️ Interactive login has a 5-minute timeout.  
  交互式登录有 5 分钟超时时间。

---

## License / 许可证

MIT
