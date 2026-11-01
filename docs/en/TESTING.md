# Testing

[中文](../TESTING.md) · [Home](../../README.en.md)

Run `npm test` and `node --check` on changed JavaScript files. Authentication or refresh changes need regression coverage for cache reuse, refresh, login fallback, and credential preservation. CLI/API changes need checks for rejected options, masked output, and migration. Tests use fake transports and temporary state directories, without a real Pixiv account.

Never place real access tokens, refresh tokens, cookies, or passwords in logs, assertion output, or fixtures. Do not run a real-account login test without explicit authorization. Report only checks actually performed.
