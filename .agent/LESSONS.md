# Regression lessons

- A valid token should be reused; an expired token should refresh before login. `refreshOnly` must never start a browser.
- Refresh must preserve the previous refresh token when the response omits it, and preserve stored browser cookies.
- Browser-cookie absence must remain explicit; an OAuth token is not a website session.
- Resolve proxy settings consistently for browser and token requests; redact secrets in errors and output.
- Validate provider and method before a cache hit so removed options cannot appear to work.
