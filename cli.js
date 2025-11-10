#!/usr/bin/env node

/**
 * Pixiv Token Getter - CLI
 * Command-line tool entry point
 */

const { loginInteractive, loginHeadless } = require('./lib/pixiv-auth');
const fs = require('fs');
const path = require('path');

/**
 * Save token to file
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
 * Show help message
 */
function showHelp() {
  console.log(`
Pixiv Token Getter - Get Pixiv login token using Puppeteer

Usage:
  node cli.js [options]

Options:
  --interactive           Interactive login (opens browser window, manual login) - default mode
  --headless <user> <pass>  Headless login (automatic login with username and password)
  --output=<file>         Specify output file path (default: pixiv-token.json)
  --help                  Show this help message

Examples:
  node cli.js --interactive
  node cli.js --headless username password
  node cli.js --interactive --output=my-token.json

Notes:
  - Interactive login: Browser window will open automatically, complete login in browser
  - Headless login: Requires correct username and password, no browser window shown
  - Token files contain sensitive information, keep them secure
`);
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);

  // Check for help option
  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    process.exit(0);
  }

  const mode = args.find(arg => arg === '--interactive' || arg === '--headless') || '--interactive';
  const outputFile = args.find(arg => arg.startsWith('--output='))?.split('=')[1] || 'pixiv-token.json';

  try {
    let tokenInfo;

    if (mode === '--headless') {
      // Headless mode requires username and password
      const usernameIndex = args.indexOf('--headless') + 1;
      const passwordIndex = usernameIndex + 1;

      if (usernameIndex >= args.length || passwordIndex >= args.length) {
        console.error('[!] Error: Headless mode requires username and password\n');
        showHelp();
        process.exit(1);
      }

      const username = args[usernameIndex];
      const password = args[passwordIndex];

      console.log('[!] Starting headless login with Puppeteer...');
      tokenInfo = await loginHeadless({ username, password });
    } else {
      // Interactive mode
      console.log('[!] Starting interactive login with Puppeteer...');
      console.log('[i] Browser window will open shortly');
      console.log('[i] Please complete the login process in the browser window');
      console.log('[i] This may take a few minutes, please wait...\n');
      
      tokenInfo = await loginInteractive({
        onBrowserOpen: () => {
          console.log('[+] Browser started\n');
        },
        onPageReady: (page, url) => {
          console.log(`[i] Login URL: ${url}\n`);
          console.log('[+] Login page opened');
          console.log('[!] Please complete login in the browser window...');
          console.log('[i] Waiting for login to complete...');
          console.log('[i] Browser window will close automatically after successful login\n');
        },
      });
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

    // Save to file
    const outputPath = path.resolve(process.cwd(), outputFile);
    saveTokenToFile(tokenInfo, outputPath);

    console.log('[+] Done!');
  } catch (error) {
    console.error('\n[!] Error:', error.message);
    process.exit(1);
  }
}

// Run main function
if (require.main === module) {
  main();
}

module.exports = { main };

