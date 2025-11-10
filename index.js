/**
 * Pixiv Token Getter - Main Entry Point
 * Kept for backward compatibility as API entry point
 */

// Export API
module.exports = require('./lib/index');

// If run directly, execute CLI
if (require.main === module) {
  require('./cli.js');
}
