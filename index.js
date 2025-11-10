#!/usr/bin/env node

/**
 * Pixiv Token Getter
 * 使用 Puppeteer 获取 Pixiv 登录 Token 的独立工具
 * 
 * 使用方法:
 *   node index.js --interactive    # 交互式登录（打开浏览器窗口）
 *   node index.js --headless <username> <password>  # 无头登录（需要用户名密码）
 *   node index.js                  # 默认使用交互式登录
 */

const puppeteer = require('puppeteer');
const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Pixiv OAuth 常量
const USER_AGENT = 'PixivIOSApp/7.13.3 (iOS 14.6; iPhone13,2)';
const AUTH_TOKEN_URL = 'https://oauth.secure.pixiv.net/auth/token';
const CLIENT_ID = 'MOBrBDS8blbauoSck0ZfDbtuzpyT';
const CLIENT_SECRET = 'lsACyCD94FhDUtGTXi3QzcFE2uU1hqtDaKeqrdwj';
const REDIRECT_URI = 'https://app-api.pixiv.net/web/v1/users/auth/pixiv/callback';
const LOGIN_URL = 'https://app-api.pixiv.net/web/v1/login';

/**
 * 生成 PKCE code verifier
 */
function generateCodeVerifier() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let result = '';
  for (let i = 0; i < 128; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * 生成 PKCE code challenge
 */
function generateCodeChallenge(verifier) {
  const hash = crypto.createHash('sha256').update(verifier).digest();
  return hash.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * 等待授权码
 */
function waitForAuthCode(page, timeoutMs) {
  return new Promise((resolve) => {
    let resolved = false;
    let pollInterval = null;

    const cleanup = () => {
      if (resolved) return;
      resolved = true;
      try {
        page.off('response', onResponse);
        page.off('framenavigated', onFrameNavigated);
        if (pollInterval) {
          clearInterval(pollInterval);
          pollInterval = null;
        }
      } catch (e) {
        // 忽略清理错误
      }
    };

    const timeout = setTimeout(() => {
      if (!resolved) {
        cleanup();
        console.log('[!] 等待授权码超时');
        resolve(null);
      }
    }, timeoutMs);

    const checkUrlForCode = (url) => {
      try {
        const urlObj = new URL(url);
        const code = urlObj.searchParams.get('code');
        if (code) {
          console.log('[+] 在 URL 中找到授权码');
          return code;
        }
      } catch (e) {
        // 无效 URL，忽略
      }
      return null;
    };

    // 立即检查当前 URL
    try {
      const currentUrl = page.url();
      const currentCode = checkUrlForCode(currentUrl);
      if (currentCode) {
        cleanup();
        clearTimeout(timeout);
        resolve(currentCode);
        return;
      }
    } catch (e) {
      // 继续使用监听器
    }

    // 监听响应事件
    const onResponse = async (response) => {
      if (resolved) return;
      try {
        const url = response.url();
        const code = checkUrlForCode(url);
        if (code) {
          cleanup();
          clearTimeout(timeout);
          resolve(code);
        }
      } catch (e) {
        // 忽略错误
      }
    };

    // 监听导航事件
    const onFrameNavigated = async (frame) => {
      if (resolved || frame !== page.mainFrame()) return;
      try {
        const url = frame.url();
        const code = checkUrlForCode(url);
        if (code) {
          cleanup();
          clearTimeout(timeout);
          resolve(code);
        }
      } catch (e) {
        // 忽略错误
      }
    };

    // 定期轮询 URL
    pollInterval = setInterval(async () => {
      if (resolved) {
        if (pollInterval) {
          clearInterval(pollInterval);
        }
        return;
      }

      try {
        const url = page.url();
        const code = checkUrlForCode(url);
        if (code) {
          cleanup();
          clearTimeout(timeout);
          resolve(code);
        }
      } catch (e) {
        // 忽略错误
      }
    }, 1000); // 每秒检查一次

    // 设置监听器
    page.on('response', onResponse);
    page.on('framenavigated', onFrameNavigated);
  });
}

/**
 * 使用授权码交换 token
 */
async function exchangeCodeForToken(code, codeVerifier) {
  try {
    console.log('[i] 正在交换 token...');

    const response = await axios.post(
      AUTH_TOKEN_URL,
      new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code: code,
        code_verifier: codeVerifier,
        grant_type: 'authorization_code',
        include_policy: 'true',
        redirect_uri: REDIRECT_URI,
      }).toString(),
      {
        headers: {
          'user-agent': USER_AGENT,
          'app-os-version': '14.6',
          'app-os': 'ios',
          'content-type': 'application/x-www-form-urlencoded',
        },
        timeout: 30000,
      }
    );

    const data = response.data;

    if (!data.access_token || !data.refresh_token) {
      throw new Error('Token 响应缺少必要的字段');
    }

    console.log('[+] Token 交换成功');

    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
      token_type: data.token_type || 'bearer',
      scope: data.scope || '',
      user: data.user,
    };
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      const status = error.response.status;
      const statusText = error.response.statusText;
      const data = error.response.data;
      throw new Error(`Token 交换失败: ${status} ${statusText}. ${data ? JSON.stringify(data) : ''}`);
    }
    throw new Error(`Token 交换失败: ${error.message}`);
  }
}

/**
 * 交互式登录（打开浏览器窗口）
 */
async function loginInteractive() {
  let browser = null;

  try {
    console.log('[!] 使用 Puppeteer 进行交互式登录...');
    console.log('[i] 浏览器窗口将很快打开');
    console.log('[i] 请在浏览器窗口中完成登录过程');
    console.log('[i] 这可能需要几分钟时间，请耐心等待\n');

    // 生成 PKCE 参数
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    // 构建登录 URL
    const loginParams = new URLSearchParams({
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      client: 'pixiv-android',
    });
    const loginUrl = `${LOGIN_URL}?${loginParams.toString()}`;

    console.log(`[i] 登录 URL: ${loginUrl}\n`);

    // 启动浏览器
    const launchOptions = {
      headless: false, // 显示浏览器窗口
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--disable-gpu',
      ],
      ignoreHTTPSErrors: true,
    };

    console.log('[i] 正在启动浏览器...');
    browser = await puppeteer.launch(launchOptions);
    console.log('[+] 浏览器已启动\n');

    const page = await browser.newPage();

    // 设置 User-Agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // 设置额外的 HTTP 头
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    });

    // 导航到登录页面
    console.log('[i] 正在打开登录页面...');
    try {
      await page.goto(loginUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    } catch (error) {
      console.log('[i] networkidle2 超时，尝试 domcontentloaded...');
      await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    }

    console.log('[+] 登录页面已打开');
    console.log('[!] 请在浏览器窗口中完成登录...');
    console.log('[i] 等待登录完成...');
    console.log('[i] 登录成功后，浏览器窗口将自动关闭\n');

    // 等待授权码（最多 5 分钟）
    const code = await waitForAuthCode(page, 300000);

    if (!code) {
      // 再次尝试从当前 URL 提取 code
      const currentUrl = page.url();
      console.log(`[!] 当前页面 URL: ${currentUrl}`);

      try {
        const urlObj = new URL(currentUrl);
        const codeFromUrl = urlObj.searchParams.get('code');
        if (codeFromUrl) {
          console.log('[+] 从当前 URL 中找到授权码');
          const tokenInfo = await exchangeCodeForToken(codeFromUrl, codeVerifier);
          await browser.close();
          browser = null;
          return tokenInfo;
        }
      } catch (e) {
        // URL 解析失败
      }

      throw new Error('未能获取授权码。登录可能已取消或超时，请重试。');
    }

    console.log('[+] 授权码已获取');

    // 交换 code 获取 token
    const tokenInfo = await exchangeCodeForToken(code, codeVerifier);

    console.log('[+] 登录成功！');

    // 关闭浏览器
    try {
      await browser.close();
      browser = null;
    } catch (e) {
      console.warn('[!] 关闭浏览器时出错，但登录已成功');
    }

    return tokenInfo;
  } catch (error) {
    console.error('[!] 登录失败:', error.message);

    // 清理资源
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        // 忽略清理错误
      }
    }

    throw error;
  }
}

/**
 * 无头登录（使用用户名密码）
 */
async function loginHeadless(username, password) {
  let browser = null;

  try {
    console.log('[!] 使用 Puppeteer 进行无头登录...');

    // 验证输入
    if (!username || username.trim() === '') {
      throw new Error('用户名不能为空');
    }
    if (!password || password.trim() === '') {
      throw new Error('密码不能为空');
    }

    // 生成 PKCE 参数
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    // 构建登录 URL
    const loginParams = new URLSearchParams({
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      client: 'pixiv-android',
    });
    const loginUrl = `${LOGIN_URL}?${loginParams.toString()}`;

    // 启动浏览器（无头模式）
    const launchOptions = {
      headless: 'new', // 使用新的无头模式
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
      ],
      ignoreHTTPSErrors: true,
    };

    console.log('[i] 正在启动无头浏览器...');
    browser = await puppeteer.launch(launchOptions);
    console.log('[+] 浏览器已启动\n');

    const page = await browser.newPage();

    // 设置 User-Agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // 设置额外的 HTTP 头
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
    });

    // 导航到登录页面
    console.log('[i] 正在打开登录页面...');
    try {
      await page.goto(loginUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    } catch (error) {
      console.log('[i] 重试使用 domcontentloaded...');
      await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    }

    // 等待登录表单加载
    console.log('[i] 等待登录表单...');
    await page.waitForSelector('input[type="text"], input[autocomplete="username"]', { timeout: 30000 });

    // 填写凭据
    console.log('[i] 填写凭据...');

    // 尝试不同的用户名选择器
    const usernameSelectors = [
      'input[autocomplete="username"]',
      'input[type="text"]',
      'input[name="pixiv_id"]',
      '#LoginComponent input[type="text"]',
    ];

    let usernameField = null;
    for (const selector of usernameSelectors) {
      try {
        usernameField = await page.$(selector);
        if (usernameField) {
          await usernameField.type(username, { delay: 100 });
          console.log('[i] 用户名已输入');
          break;
        }
      } catch (e) {
        // 尝试下一个选择器
      }
    }

    if (!usernameField) {
      throw new Error('找不到用户名输入框');
    }

    // 尝试不同的密码选择器
    const passwordSelectors = [
      'input[autocomplete="current-password"]',
      'input[type="password"]',
      'input[name="password"]',
      '#LoginComponent input[type="password"]',
    ];

    let passwordField = null;
    for (const selector of passwordSelectors) {
      try {
        passwordField = await page.$(selector);
        if (passwordField) {
          await passwordField.type(password, { delay: 100 });
          console.log('[i] 密码已输入');
          break;
        }
      } catch (e) {
        // 尝试下一个选择器
      }
    }

    if (!passwordField) {
      throw new Error('找不到密码输入框');
    }

    // 提交表单
    console.log('[i] 提交登录表单...');

    // 尝试不同的提交按钮选择器
    const submitSelectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      '#LoginComponent button[type="submit"]',
    ];

    let submitted = false;
    for (const selector of submitSelectors) {
      try {
        const submitButton = await page.$(selector);
        if (submitButton) {
          await submitButton.click();
          submitted = true;
          console.log('[i] 表单已提交');
          break;
        }
      } catch (e) {
        // 尝试下一个选择器
      }
    }

    if (!submitted) {
      // 尝试按 Enter 键作为后备方案
      await passwordField.press('Enter');
      console.log('[i] 表单已提交（Enter 键）');
    }

    // 等待授权码（最多 2 分钟）
    console.log('[i] 等待认证...');
    const code = await waitForAuthCode(page, 120000);

    if (!code) {
      throw new Error('未能获取授权码。请检查您的凭据。');
    }

    console.log('[+] 授权码已获取');

    // 交换 code 获取 token
    const tokenInfo = await exchangeCodeForToken(code, codeVerifier);

    console.log('[+] 登录成功！');

    // 关闭浏览器
    await browser.close();
    browser = null;

    return tokenInfo;
  } catch (error) {
    console.error('[!] 无头登录失败:', error.message);

    // 清理资源
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        // 忽略清理错误
      }
    }

    throw error;
  }
}

/**
 * 保存 token 到文件
 */
function saveTokenToFile(tokenInfo, outputPath) {
  const output = {
    access_token: tokenInfo.access_token,
    refresh_token: tokenInfo.refresh_token,
    expires_in: tokenInfo.expires_in,
    token_type: tokenInfo.token_type,
    scope: tokenInfo.scope,
    user: tokenInfo.user,
    obtained_at: new Date().toISOString(),
  };

  const content = JSON.stringify(output, null, 2);
  fs.writeFileSync(outputPath, content, 'utf8');
  console.log(`[+] Token 已保存到: ${outputPath}`);
}

/**
 * 显示帮助信息
 */
function showHelp() {
  console.log(`
Pixiv Token Getter - 使用 Puppeteer 获取 Pixiv 登录 Token

使用方法:
  node index.js [选项]

选项:
  --interactive           交互式登录（打开浏览器窗口，手动登录）- 默认模式
  --headless <user> <pass>  无头登录（使用用户名密码自动登录）
  --output=<file>         指定输出文件路径（默认: pixiv-token.json）
  --help                  显示此帮助信息

示例:
  node index.js --interactive
  node index.js --headless username password
  node index.js --interactive --output=my-token.json

注意:
  - 交互式登录：浏览器窗口会自动打开，请在浏览器中完成登录
  - 无头登录：需要提供正确的用户名和密码，不显示浏览器窗口
  - Token 文件包含敏感信息，请妥善保管
`);
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);

  // 检查帮助选项
  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    process.exit(0);
  }

  const mode = args.find(arg => arg === '--interactive' || arg === '--headless') || '--interactive';
  const outputFile = args.find(arg => arg.startsWith('--output='))?.split('=')[1] || 'pixiv-token.json';

  try {
    let tokenInfo;

    if (mode === '--headless') {
      // 无头模式需要用户名和密码
      const usernameIndex = args.indexOf('--headless') + 1;
      const passwordIndex = usernameIndex + 1;

      if (usernameIndex >= args.length || passwordIndex >= args.length) {
        console.error('[!] 错误: 无头模式需要用户名和密码\n');
        showHelp();
        process.exit(1);
      }

      const username = args[usernameIndex];
      const password = args[passwordIndex];

      tokenInfo = await loginHeadless(username, password);
    } else {
      // 交互式模式
      tokenInfo = await loginInteractive();
    }

    // 输出 token 信息
    console.log('\n========== Token 信息 ==========');
    console.log(`Access Token: ${tokenInfo.access_token.substring(0, 20)}...`);
    console.log(`Refresh Token: ${tokenInfo.refresh_token.substring(0, 20)}...`);
    console.log(`过期时间: ${tokenInfo.expires_in} 秒`);
    console.log(`Token 类型: ${tokenInfo.token_type}`);
    if (tokenInfo.user) {
      console.log(`用户: ${tokenInfo.user.name} (ID: ${tokenInfo.user.id})`);
    }
    console.log('================================\n');

    // 保存到文件
    const outputPath = path.resolve(process.cwd(), outputFile);
    saveTokenToFile(tokenInfo, outputPath);

    console.log('[+] 完成！');
  } catch (error) {
    console.error('\n[!] 错误:', error.message);
    process.exit(1);
  }
}

// 运行主函数
if (require.main === module) {
  main();
}

module.exports = {
  loginInteractive,
  loginHeadless,
  generateCodeVerifier,
  generateCodeChallenge,
  exchangeCodeForToken,
};

