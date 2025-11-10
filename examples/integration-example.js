/**
 * Integration Example
 * Demonstrates how to integrate Pixiv Token Getter into your project
 */

const { getTokenInteractive } = require('../lib');
const fs = require('fs');
const path = require('path');

/**
 * Example: Save token to config file
 */
async function saveTokenToConfig() {
  try {
    const token = await getTokenInteractive();
    
    const config = {
      pixiv: {
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        expiresAt: Date.now() + (token.expires_in * 1000),
        user: token.user,
      },
    };

    const configPath = path.join(process.cwd(), 'config.json');
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    
    console.log('Token saved to config file:', configPath);
    return config;
  } catch (error) {
    console.error('Failed to save token:', error.message);
    throw error;
  }
}

/**
 * Example: Integrate in Express app
 */
function createExpressMiddleware() {
  const express = require('express');
  const app = express();

  // Token storage (should use database or Redis in production)
  let cachedToken = null;

  // API endpoint to get token
  app.get('/api/pixiv/token', async (req, res) => {
    try {
      if (cachedToken && cachedToken.expiresAt > Date.now()) {
        return res.json({ token: cachedToken.accessToken });
      }

      // Get new token
      const token = await getTokenInteractive();
      cachedToken = {
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        expiresAt: Date.now() + (token.expires_in * 1000),
      };

      res.json({ token: cachedToken.accessToken });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return app;
}

/**
 * Example: Use in Node.js script
 */
async function useInScript() {
  try {
    // Get token
    const token = await getTokenInteractive();

    // Use token to call Pixiv API
    const axios = require('axios');
    const response = await axios.get('https://app-api.pixiv.net/v1/illust/recommended', {
      headers: {
        'Authorization': `Bearer ${token.access_token}`,
      },
    });

    console.log('Got recommended illustrations:', response.data.illusts.length);
    return response.data;
  } catch (error) {
    console.error('API call failed:', error.message);
    throw error;
  }
}

module.exports = {
  saveTokenToConfig,
  createExpressMiddleware,
  useInScript,
};
