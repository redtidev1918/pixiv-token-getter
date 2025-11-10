/**
 * Basic Usage Example
 * Demonstrates how to use Pixiv Token Getter API
 */

const { getTokenInteractive, getTokenHeadless } = require('../lib');

async function exampleInteractive() {
  try {
    console.log('Starting interactive login...');
    
    const token = await getTokenInteractive({
      onBrowserOpen: () => {
        console.log('Browser opened, please complete login in browser');
      },
      onPageReady: (page, url) => {
        console.log('Login page ready');
      },
    });

    console.log('Login successful!');
    console.log('Access Token:', token.access_token.substring(0, 20) + '...');
    console.log('User:', token.user?.name);
    
    return token;
  } catch (error) {
    console.error('Login failed:', error.message);
    throw error;
  }
}

async function exampleHeadless() {
  try {
    console.log('Starting headless login...');
    
    const token = await getTokenHeadless({
      username: 'your_username',
      password: 'your_password',
    });

    console.log('Login successful!');
    console.log('Access Token:', token.access_token.substring(0, 20) + '...');
    console.log('User:', token.user?.name);
    
    return token;
  } catch (error) {
    console.error('Login failed:', error.message);
    throw error;
  }
}

// Run example (uncomment to run)
// exampleInteractive().catch(console.error);
// exampleHeadless().catch(console.error);

module.exports = {
  exampleInteractive,
  exampleHeadless,
};
