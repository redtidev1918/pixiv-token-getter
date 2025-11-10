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
        console.log('[!] Timeout waiting for authorization code');
        resolve(null);
      }
    }, timeoutMs);

    const checkUrlForCode = (url) => {
      try {
        const urlObj = new URL(url);
        const code = urlObj.searchParams.get('code');
        if (code) {
          console.log('[+] Authorization code found in URL');
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
    console.log('[i] Exchanging token...');

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
      throw new Error('Token response missing required fields');
    }

    console.log('[+] Token exchange successful');

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
      throw new Error(`Token exchange failed: ${status} ${statusText}. ${data ? JSON.stringify(data) : ''}`);
    }
    throw new Error(`Token exchange failed: ${error.message}`);
  }
}

/**
 * 交互式登录（打开浏览器窗口）
 */
async function loginInteractive() {
  let browser = null;

  try {
    console.log('[!] Starting interactive login with Puppeteer...');
    console.log('[i] Browser window will open shortly');
    console.log('[i] Please complete the login process in the browser window');
    console.log('[i] This may take a few minutes, please wait...\n');

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

    console.log(`[i] Login URL: ${loginUrl}\n`);

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

    console.log('[i] Starting browser...');
    browser = await puppeteer.launch(launchOptions);
    console.log('[+] Browser started\n');

    const page = await browser.newPage();

    // 设置 User-Agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // 设置额外的 HTTP 头
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    });

    // Navigate to login page
    console.log('[i] Opening login page...');
    try {
      await page.goto(loginUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    } catch (error) {
      console.log('[i] networkidle2 timeout, trying domcontentloaded...');
      await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    }

    console.log('[+] Login page opened');
    console.log('[!] Please complete login in the browser window...');
    console.log('[i] Waiting for login to complete...');
    console.log('[i] Browser window will close automatically after successful login\n');

    // 等待授权码（最多 5 分钟）
    const code = await waitForAuthCode(page, 300000);

    if (!code) {
      // Try to extract code from current URL again
      const currentUrl = page.url();
      console.log(`[!] Current page URL: ${currentUrl}`);

      try {
        const urlObj = new URL(currentUrl);
        const codeFromUrl = urlObj.searchParams.get('code');
        if (codeFromUrl) {
          console.log('[+] Authorization code found in current URL');
          const tokenInfo = await exchangeCodeForToken(codeFromUrl, codeVerifier);
          await browser.close();
          browser = null;
          return tokenInfo;
        }
      } catch (e) {
        // URL parsing failed
      }

      throw new Error('Failed to get authorization code. Login may have been cancelled or timed out. Please try again.');
    }

    console.log('[+] Authorization code obtained');

    // Exchange code for token
    const tokenInfo = await exchangeCodeForToken(code, codeVerifier);

    console.log('[+] Login successful!');

    // Close browser
    try {
      await browser.close();
      browser = null;
    } catch (e) {
      console.warn('[!] Error closing browser, but login was successful');
    }

    return tokenInfo;
  } catch (error) {
    console.error('[!] Login failed:', error.message);

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
    console.log('[!] Starting headless login with Puppeteer...');

    // Validate input
    if (!username || username.trim() === '') {
      throw new Error('Username cannot be empty');
    }
    if (!password || password.trim() === '') {
      throw new Error('Password cannot be empty');
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

    console.log('[i] Starting headless browser...');
    browser = await puppeteer.launch(launchOptions);
    console.log('[+] Browser started\n');

    const page = await browser.newPage();

    // 设置 User-Agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // 设置额外的 HTTP 头
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
    });

    // Navigate to login page
    console.log('[i] Opening login page...');
    try {
      await page.goto(loginUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    } catch (error) {
      console.log('[i] Retrying with domcontentloaded...');
      await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    }

    // Wait for login form to load
    console.log('[i] Waiting for login form...');
    await page.waitForSelector('input[type="text"], input[autocomplete="username"]', { timeout: 30000 });

    // Fill credentials
    console.log('[i] Entering credentials...');

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
          console.log('[i] Username entered');
          break;
        }
      } catch (e) {
        // 尝试下一个选择器
      }
    }

    if (!usernameField) {
      throw new Error('Could not find username input field');
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
          console.log('[i] Password entered');
          break;
        }
      } catch (e) {
        // 尝试下一个选择器
      }
    }

    if (!passwordField) {
      throw new Error('Could not find password input field');
    }

    // Submit form
    console.log('[i] Submitting login form...');

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
          console.log('[i] Form submitted');
          break;
        }
      } catch (e) {
        // 尝试下一个选择器
      }
    }

    if (!submitted) {
      // Try pressing Enter as fallback
      await passwordField.press('Enter');
      console.log('[i] Form submitted (Enter key)');
    }

    // Wait for authorization code (max 2 minutes)
    console.log('[i] Waiting for authentication...');
    const code = await waitForAuthCode(page, 120000);

    if (!code) {
      throw new Error('Failed to get authorization code. Please check your credentials.');
    }

    console.log('[+] Authorization code obtained');

    // Exchange code for token
    const tokenInfo = await exchangeCodeForToken(code, codeVerifier);

    console.log('[+] Login successful!');

    // 关闭浏览器
    await browser.close();
    browser = null;

    return tokenInfo;
  } catch (error) {
    console.error('[!] Headless login failed:', error.message);

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
  console.log(`[+] Token saved to: ${outputPath}`);
}

/**
 * 显示帮助信息
 */
function showHelp() {
  console.log(`
Pixiv Token Getter - Get Pixiv login token using Puppeteer

Usage:
  node index.js [options]

Options:
  --interactive           Interactive login (opens browser window, manual login) - default mode
  --headless <user> <pass>  Headless login (automatic login with username and password)
  --output=<file>         Specify output file path (default: pixiv-token.json)
  --help                  Show this help message

Examples:
  node index.js --interactive
  node index.js --headless username password
  node index.js --interactive --output=my-token.json

Notes:
  - Interactive login: Browser window will open automatically, complete login in browser
  - Headless login: Requires correct username and password, no browser window shown
  - Token files contain sensitive information, keep them secure
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
        console.error('[!] Error: Headless mode requires username and password\n');
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

    // Output token information
    console.log('\n========== Token Information ==========');
    console.log(`Access Token: ${tokenInfo.access_token.substring(0, 20)}...`);
    console.log(`Refresh Token: ${tokenInfo.refresh_token.substring(0, 20)}...`);
    console.log(`Expires In: ${tokenInfo.expires_in} seconds`);
    console.log(`Token Type: ${tokenInfo.token_type}`);
    if (tokenInfo.user) {
      console.log(`User: ${tokenInfo.user.name} (ID: ${tokenInfo.user.id})`);
    }
    console.log('========================================\n');

    // 保存到文件
    const outputPath = path.resolve(process.cwd(), outputFile);
    saveTokenToFile(tokenInfo, outputPath);

    console.log('[+] Done!');
  } catch (error) {
    console.error('\n[!] Error:', error.message);
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

