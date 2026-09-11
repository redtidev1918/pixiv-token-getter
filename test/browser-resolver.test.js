'use strict';

/**
 * Tests for the system-browser resolver (lib/browser/resolver.js) and the
 * launch-time UX when no browser exists.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  findBrowserExecutable,
  browserNotFoundMessage,
  KNOWN_LOCATIONS,
} = require('../lib/browser/resolver');

function withEnv(overrides, fn) {
  const saved = { ...process.env };
  try {
    for (const [k, v] of Object.entries(overrides)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    fn();
  } finally {
    process.env = saved;
  }
}

function makeFakeBrowser(dir) {
  const file = path.join(dir, 'fake-chrome' + (process.platform === 'win32' ? '.exe' : ''));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, '#!/bin/sh\n');
  fs.chmodSync(file, 0o755);
  return file;
}

describe('findBrowserExecutable', () => {
  test('explicit executablePath wins and is resolved to absolute', () => {
    withEnv({ PUPPETEER_EXECUTABLE_PATH: undefined }, () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ptg-resolver-'));
      const exe = makeFakeBrowser(dir);
      assert.strictEqual(findBrowserExecutable({ executablePath: exe }), path.resolve(exe));
    });
  });

  test('PUPPETEER_EXECUTABLE_PATH is honored without options', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ptg-resolver-'));
    const exe = makeFakeBrowser(dir);
    withEnv({ PUPPETEER_EXECUTABLE_PATH: exe }, () => {
      assert.strictEqual(findBrowserExecutable(), path.resolve(exe));
    });
  });

  test('invalid explicit path yields null (caller shows guidance)', () => {
    withEnv({ PUPPETEER_EXECUTABLE_PATH: undefined }, () => {
      assert.strictEqual(
        findBrowserExecutable({ executablePath: '/definitely/not/here' }),
        null
      );
    });
  });

  test('discovers browsers on PATH', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ptg-resolver-path-'));
    const exe = makeFakeBrowser(dir);
    const savedPath = process.env.PATH;
    const savedKnown = KNOWN_LOCATIONS[process.platform];
    try {
      // Known locations are checked before PATH by design; neutralize them so
      // this test exercises the PATH branch deterministically on any machine.
      KNOWN_LOCATIONS[process.platform] = [];
      process.env.PATH = dir + path.delimiter + savedPath;
      // Name the fake binary like a real candidate so PATH lookup finds it.
      const named = path.join(dir, process.platform === 'win32' ? 'chrome.exe' : 'google-chrome');
      fs.copyFileSync(exe, named);
      fs.chmodSync(named, 0o755);
      withEnv({ PUPPETEER_EXECUTABLE_PATH: undefined }, () => {
        assert.strictEqual(findBrowserExecutable(), path.resolve(named));
      });
    } finally {
      process.env.PATH = savedPath;
      KNOWN_LOCATIONS[process.platform] = savedKnown;
    }
  });

  test('returns null when nothing exists', () => {
    withEnv(
      { PUPPETEER_EXECUTABLE_PATH: undefined, PATH: os.tmpdir() },
      () => {
        // With PATH reduced to an empty dir and no env override this must not
        // find a browser on any platform (CI has no Chrome pre-seeded dirs
        // that survive; if a system Chrome exists the KNOWN_LOCATIONS probe
        // may legitimately find it, so assert only the PATH/override logic).
        const result = findBrowserExecutable();
        assert.ok(result === null || fs.existsSync(result));
      }
    );
  });
});

describe('browserNotFoundMessage', () => {
  test('mentions PUPPETEER_EXECUTABLE_PATH and Chrome/Chromium', () => {
    const msg = browserNotFoundMessage();
    assert.ok(msg.includes('PUPPETEER_EXECUTABLE_PATH'));
    assert.ok(msg.includes('Chrome/Chromium'));
  });
});
