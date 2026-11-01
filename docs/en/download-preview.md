This package is distributed through npm. Releases contain metadata, not standalone executables or platform installers.

## Install as a dependency

```sh
npm install pixiv-token-getter
```

## Install the CLI

Both `pixiv-token-getter` and `ptg` run the same command:

```sh
npm install -g pixiv-token-getter
ptg --help
```

Native login needs an existing Chrome/Chromium installation; set `PUPPETEER_EXECUTABLE_PATH` if it cannot be found.

## Run from source

```sh
git clone https://github.com/redtidev1918/pixiv-token-getter.git
cd pixiv-token-getter
npm ci
node cli.js --help
```

See the [changelog](https://github.com/redtidev1918/pixiv-token-getter/blob/main/CHANGELOG.md), [English README](/README.en.md), and [中文 README](/README.md).
