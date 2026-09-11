#!/usr/bin/env node

/**
 * Pixiv Token Getter — CLI entry point.
 *
 * The implementation lives in `lib/cli/` so it can be unit tested without
 * spawning a process. This file only wires up process exit codes.
 */

const { main } = require('./lib/cli/index');
const { parseArgs } = require('./lib/cli/args');
const { saveTokenToFile } = require('./lib/cli/output');

function run() {
  main()
    .then((code) => {
      process.exitCode = typeof code === 'number' ? code : 0;
    })
    .catch((error) => {
      // Last-resort guard: never dump a stack that might contain secrets.
      process.stderr.write(`[!] Fatal: ${error && error.message ? error.message : error}\n`);
      process.exitCode = 1;
    });
}

if (require.main === module) {
  run();
}

module.exports = { main, parseArgs, saveTokenToFile, run };
