## Guides

### Native login

Two mechanisms, one provider:

| `method` | What it does | Use when |
| --- | --- | --- |
| `oauth` / `browser` | Opens the Pixiv login page; **you** log in. Aliases of each other. | Normal, most reliable (**recommended**) |
| `e2e` | Automates the username/password form (headless by default) | Unattended setup; may be flagged as automation |

```bash
ptg login                          # == --method oauth
ptg login --method browser
PIXIV_USERNAME=user PIXIV_PASSWORD=pass ptg login --method e2e
```

Legacy flags keep working and map onto the above:

```bash
ptg --interactive              # → ptg login --method browser   (deprecated)
ptg --headless user pass       # → ptg login --method e2e       (deprecated)
ptg --interactive --output=f.json
```

### Refresh

```bash
ptg refresh                 # refresh the stored token for the default profile
ptg refresh --profile main
```

```js
const { refreshToken, refreshStoredToken } = require('pixiv-token-getter');

// Refresh an arbitrary refresh token (no store involved):
const renewed = await refreshToken('the-refresh-token');

// Refresh whatever is stored for a profile (explicit, even if still valid):
const stored = await refreshStoredToken({ profile: 'main' });
```

**Rotation is handled.** Pixiv may return a *new* refresh token; the new one is always persisted, and an empty value will never overwrite a good one.

### Profiles

```bash
ptg configure --profile main --provider native --method oauth
ptg login     --profile main
ptg status    --profile main

ptg configure --list
```

```js
const token = await getToken({ profile: 'main' });
```

State layout (XDG):

```
$XDG_CONFIG_HOME/pixiv-token-getter/     (fallback: ~/.config/pixiv-token-getter/)
├── profiles/<name>.json          non-secret preferences (never passwords)
├── tokens/<name>.token.json      secrets, 0600, written atomically
└── browser/<name>/               persistent Chrome profile, 0700
```

Upgrading from `2.3` migrates the old `profile/` directory to `browser/default/`, so existing logins survive.

### gppt interoperability (optional)

[gppt](https://github.com/eggplants/get-pixivpy-token) is an **optional interoperability provider**, not a dependency.

```bash
pip install gppt
gppt configure
gppt login
```

Then either import its credential when you want to (recommended):

```bash
ptg import gppt
ptg import gppt --profile main --source-profile default
```

or delegate a login explicitly:

```bash
ptg login --provider gppt
ptg login --provider gppt --method e2e    # runs `gppt login` for you
```

```js
await importGppt({ profile: 'main' });   // reads ~/.config/gppt/<profile>.token.json
```

What we deliberately do **not** do:

- ❌ parse gppt's stdout / regex-scrape secrets
- ❌ require Python for core functionality
- ❌ fabricate `web_cookies` for a gppt token (see below)

Credential lookup order: `$GPPT_CONFIG_DIR` → `$XDG_CONFIG_HOME/gppt` → `~/.config/gppt`; file `<profile>.token.json` (bare `.token.json` also accepted for the default profile). `~` is expanded (gppt itself does not).

### Web cookies (`PHPSESSID`)

Two different credentials, two different purposes — do not mix them:

| Credential | Used for | Produced by |
| --- | --- | --- |
| OAuth `access_token` | Pixiv **App API** (`app-api.pixiv.net`) | any provider |
| `web_cookies.PHPSESSID` | Pixiv **website / web session** | native browser login only |

```js
const token = await getToken();
console.log(token.web_cookies); // { PHPSESSID: '...' } — native only
```

A gppt-imported token has **no** `web_cookies`: the field is omitted rather than faked. Refreshing preserves existing cookies (a refresh response carries none).

### Proxy

A single resolver feeds **both** the OAuth/token requests and Puppeteer, so the browser and the token exchange can never disagree:

```bash
export HTTPS_PROXY=http://127.0.0.1:8080
ptg login
```

```js
await getToken({ proxy: 'http://user:pass@proxy:8080' });  // explicit
await getToken({ proxy: false });                          // force-disable proxying
```

Precedence: explicit option → `ALL_PROXY` → `HTTPS_PROXY` → `HTTP_PROXY`. Proxy passwords are redacted in every log and error message.

### Server / headless runtimes (CI, Docker, Fly, Actions)

**Do not** log in from a server. Log in locally once, then only ever refresh:

```js
const token = await getToken({ profile: 'main', refreshOnly: true });
```

`refreshOnly: true` never spawns a browser: if the refresh token is missing/expired, it throws `RefreshError` and the job fails **visibly** instead of launching Chromium in a loop.

