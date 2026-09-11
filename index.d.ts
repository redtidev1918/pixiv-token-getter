/**
 * Pixiv Token Getter — TypeScript definitions
 *
 * Two layers:
 *  - high-level credential lifecycle: `getToken`, `login`, `refreshToken`, `status`, `logout`
 *  - legacy one-shot helpers: `getTokenInteractive`, `getTokenHeadless`, ...
 */

import type { Browser, Page } from 'puppeteer';

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

/** Provider identifiers. */
export type ProviderId = 'native' | 'gppt' | 'auto';

/** Login methods. `oauth` and `browser` are aliases (interactive PKCE browser login). */
export type AuthMethod = 'oauth' | 'browser' | 'e2e' | 'import';

/** User information returned by the token endpoint. */
export interface UserInfo {
  id?: string;
  name?: string;
  account?: string;
  profile_image_urls?: { medium?: string };
  is_premium?: boolean;
  [key: string]: any;
}

/**
 * Normalised credential.
 *
 * `expires_at` / `obtained_at` are absolute ISO-8601 timestamps WITH a timezone
 * designator; always prefer them over recomputing from `expires_in`.
 */
export interface TokenInfo {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  /** Absolute expiry (ISO-8601, timezone-aware) */
  expires_at?: string;
  /** When the token was issued (ISO-8601, timezone-aware) */
  obtained_at?: string;
  token_type?: string;
  scope?: string;
  user?: UserInfo;
  /**
   * Pixiv **web session** cookies (e.g. PHPSESSID). Only the native browser
   * provider produces these; a gppt-imported token never has them.
   */
  web_cookies?: Record<string, string>;
  provider?: ProviderId;
  method?: AuthMethod;
  /** Set when the token came from a refresh */
  last_refreshed_at?: string;
  /** Filled in by the CLI for display purposes */
  profile?: string;
}

/** Non-secret proxy configuration. */
export interface ProxyConfig {
  url: string;
  protocol: string;
  host: string;
  port?: number;
  username?: string;
  password?: string;
  source?: 'option' | 'env';
}

/** Persisted (non-secret) profile preferences. Passwords are never stored. */
export interface Profile {
  name: string;
  provider: ProviderId;
  method: AuthMethod;
  userDataDir: string | null;
  proxy: string | ProxyConfig | null;
  tokenPath: string | null;
  /** Opt-in only; never saved unless explicitly requested. */
  totpSecret: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/** Login options shared by all providers. */
export interface LoginOptions {
  /** Profile to operate on (default: `default`) */
  profile?: string;
  provider?: ProviderId;
  method?: AuthMethod;
  username?: string;
  password?: string;
  /** TOTP second factor, supplied up-front */
  totpCode?: string;
  /** Called only when Pixiv actually asks for a second factor */
  totpPrompt?: () => Promise<string>;
  /** Opt-in: derive the second factor from a base32 secret */
  totpSecret?: string;
  timeout?: number;
  /** Persistent Chrome profile directory; `''` forces an ephemeral profile */
  userDataDir?: string;
  /** Explicit proxy URL/config, or `false` to disable proxying entirely */
  proxy?: string | ProxyConfig | false | null;
  headless?: boolean;
  onBrowserOpen?: (browser: Browser) => void;
  onPageReady?: (page: Page, url: string) => void;
  /** Injectable HTTP transport (testing / custom networking) */
  transport?: (request: HttpTransportRequest) => Promise<HttpTransportResponse>;
  /** Which gppt profile to read from for the gppt provider */
  sourceProfile?: string;
  /** Internal: used by the CLI to stream events */
  onEvent?: (event: { type: string; [key: string]: any }) => void;
}

/** Options for `getToken()`. */
export interface GetTokenOptions extends LoginOptions {
  /** Skip cache AND refresh, log in again */
  force?: boolean;
  /** Never attempt an interactive login; fail visibly instead (server runtimes) */
  refreshOnly?: boolean;
  /** Expiry safety margin in ms (default: 5 minutes) */
  skewMs?: number;
  tokenStore?: TokenStore;
  profileDir?: string;
}

/** Options for `refreshToken()`. */
export interface RefreshOptions {
  transport?: (request: HttpTransportRequest) => Promise<HttpTransportResponse>;
  proxy?: string | ProxyConfig | false | null;
  /** Currently stored token; enables refresh-token rotation safety */
  previous?: TokenInfo;
  provider?: ProviderId;
  method?: AuthMethod;
  timeout?: number;
  obtainedAt?: Date;
}

export interface HttpTransportRequest {
  url: string;
  form: Record<string, string>;
  headers: Record<string, string>;
  timeout: number;
  proxy: ProxyConfig | null;
}

export interface HttpTransportResponse {
  status: number;
  data: any;
}

// ---------------------------------------------------------------------------
// Provider contract
// ---------------------------------------------------------------------------

export interface AuthProvider {
  readonly id: string;
  readonly methods: AuthMethod[];
  login(options: LoginOptions): Promise<TokenInfo>;
  refresh?(refreshToken: string, options?: RefreshOptions): Promise<TokenInfo>;
  isAvailable?(options?: { force?: boolean }): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Token persistence
// ---------------------------------------------------------------------------

export interface TokenStore {
  load(profile: string): Promise<TokenInfo | null>;
  save(profile: string, token: TokenInfo): Promise<void>;
  remove(profile: string): Promise<void>;
  pathFor?(profile: string): string;
  list?(): Promise<string[]>;
}

export declare class FileTokenStore implements TokenStore {
  constructor(options?: { dir?: string });
  dir: string;
  pathFor(profile: string): string;
  load(profile: string): Promise<TokenInfo | null>;
  save(profile: string, token: TokenInfo): Promise<void>;
  remove(profile: string): Promise<void>;
  list(): Promise<string[]>;
}

export declare class MemoryTokenStore implements TokenStore {
  constructor();
  pathFor(profile: string): string;
  load(profile: string): Promise<TokenInfo | null>;
  save(profile: string, token: TokenInfo): Promise<void>;
  remove(profile: string): Promise<void>;
  list(): Promise<string[]>;
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export interface TokenStatus {
  profile: string;
  provider: string;
  method?: string;
  hasToken: boolean;
  user?: UserInfo | null;
  accessToken: {
    present: boolean;
    valid: boolean;
    expiresAt?: string | null;
    expiresIn?: number | null;
    msUntilExpiry?: number | null;
  };
  refreshToken: { present: boolean };
  webSession: { present: boolean; cookies: string[] };
  obtainedAt?: string | null;
  lastRefreshedAt?: string | null;
  tokenFile?: string | null;
  browserDir?: string | null;
}

export interface LogoutResult {
  profile: string;
  tokenRemoved: boolean;
  profileRemoved: boolean;
  browserRemoved: boolean;
}

export interface ResolvedToken {
  token: TokenInfo;
  source: 'cache' | 'refresh' | 'login';
  providerId?: string;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type AuthErrorCode =
  | 'AUTH_ERROR'
  | 'LOGIN_ERROR'
  | 'TOKEN_EXCHANGE_ERROR'
  | 'REFRESH_ERROR'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROFILE_ERROR'
  | 'TOKEN_STORE_ERROR'
  | 'TWO_FACTOR_REQUIRED'
  | 'INVALID_CALLBACK';

export declare class AuthError extends Error {
  code: AuthErrorCode;
  provider?: string;
  details?: Record<string, any>;
  cause?: unknown;
}
export declare class LoginError extends AuthError {}
export declare class TokenExchangeError extends AuthError {}
export declare class RefreshError extends AuthError {}
export declare class ProviderUnavailableError extends AuthError {}
export declare class ProfileError extends AuthError {}
export declare class TokenStoreError extends AuthError {}
export declare class TwoFactorRequiredError extends AuthError {}

export declare const ErrorCode: Record<string, AuthErrorCode>;
export declare function isAuthError(error: unknown): error is AuthError;

// ---------------------------------------------------------------------------
// High-level lifecycle API
// ---------------------------------------------------------------------------

/** Cached → refresh → login, then persist. The recommended entry point. */
export function getToken(options?: GetTokenOptions): Promise<TokenInfo>;

/** Like `getToken`, but also reports how the token was obtained. */
export function resolveToken(options?: GetTokenOptions): Promise<ResolvedToken>;

/** Force a fresh login (bypassing cache and refresh) and persist it. */
export function login(options?: GetTokenOptions): Promise<TokenInfo>;

/** Refresh an access token directly, without touching the store. */
export function refreshToken(refreshToken: string, options?: RefreshOptions): Promise<TokenInfo>;

/** Refresh the stored token for a profile (explicitly, even if still valid). */
export function refreshStoredToken(options?: GetTokenOptions): Promise<TokenInfo>;

/** Inspect a profile without revealing secrets. */
export function status(options?: { profile?: string; tokenStore?: TokenStore; skewMs?: number }): Promise<TokenStatus>;

/** Remove stored credentials. */
export function logout(options?: {
  profile?: string;
  purge?: boolean;
  tokenStore?: TokenStore;
}): Promise<LogoutResult>;

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

export function loadProfile(name?: string): Promise<Profile>;
export function saveProfile(name: string, patch: Partial<Profile>): Promise<Profile>;
export function listProfiles(): Promise<string[]>;
export function removeProfile(name?: string): Promise<void>;
export function defaultProfile(name?: string): Profile;

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

export declare const providers: {
  native: AuthProvider;
  gppt: AuthProvider;
  getProvider(id: string): AuthProvider;
  providerPlan(id?: string): AuthProvider[];
  loginWithFallback(options?: LoginOptions): Promise<{ token: TokenInfo; providerId: string; attempts: string[] }>;
};
export declare function getProvider(id: string): AuthProvider;
export declare function providerPlan(id?: string): AuthProvider[];
export declare const PROVIDER_IDS: ProviderId[];
export declare const AUTH_METHODS: AuthMethod[];

/** gppt interoperability namespace. */
export declare const gppt: {
  id: 'gppt';
  methods: AuthMethod[];
  isAvailable(options?: { force?: boolean }): Promise<boolean>;
  login(options?: LoginOptions & { sourceProfile?: string }): Promise<TokenInfo>;
  refresh(refreshToken: string, options?: RefreshOptions): Promise<TokenInfo>;
  resolveGpptConfigDir(env?: NodeJS.ProcessEnv): string;
  findGpptTokenFile(profile?: string, env?: NodeJS.ProcessEnv): string | null;
  readGpptTokenFile(profile?: string, env?: NodeJS.ProcessEnv): { file: string; raw: any };
  normalizeGpptToken(raw: any): TokenInfo;
};

/** Import an existing gppt credential into this package's store. */
export function importGppt(options?: {
  profile?: string;
  sourceProfile?: string;
  tokenStore?: TokenStore;
}): Promise<TokenInfo>;

// ---------------------------------------------------------------------------
// Token utilities
// ---------------------------------------------------------------------------

export function isTokenExpired(token: TokenInfo | null | undefined, skewMs?: number): boolean;
export function msUntilExpiry(token: TokenInfo | null | undefined): number | null;
export function normalizeTokenInfo(raw: any, options?: Record<string, any>): TokenInfo;
export declare const TOKEN_EXPIRY_SKEW_MS: number;

// ---------------------------------------------------------------------------
// OAuth primitives / helpers
// ---------------------------------------------------------------------------

export function generateCodeVerifier(): string;
export function generateCodeChallenge(verifier: string): string;
export function buildLoginUrl(codeChallenge: string): string;
export function exchangeCodeForToken(code: string, codeVerifier: string): Promise<TokenInfo>;
export function resolveProxy(
  explicit?: string | ProxyConfig | false | null,
  options?: { env?: NodeJS.ProcessEnv }
): ProxyConfig | null;
export function redactProxyUrl(url?: string | null): string;
export function maskSecret(value?: string | null, options?: { keep?: number }): string;

export declare const constants: {
  CLIENT_ID: string;
  CLIENT_SECRET: string;
  USER_AGENT: string;
  APP_OS: string;
  APP_OS_VERSION: string;
  BROWSER_USER_AGENT: string;
  TOKEN_URL: string;
  LOGIN_URL: string;
  REDIRECT_URI: string;
  CALLBACK_HOST: string;
};

export declare const paths: {
  getConfigDir(): string;
  getProfilesDir(): string;
  getTokensDir(): string;
  getBrowserRootDir(): string;
  getBrowserDir(profile?: string): string;
  getTokenFilePath(profile?: string): string;
  getProfileFilePath(profile?: string): string;
  migrateLegacyBrowserProfile(profile?: string): { migrated: boolean; from?: string; to?: string };
};

export declare const version: string;

// ---------------------------------------------------------------------------
// Legacy API (still supported)
// ---------------------------------------------------------------------------

export interface InteractiveLoginOptions {
  headless?: boolean;
  timeout?: number;
  /** Persistent Chrome profile directory */
  userDataDir?: string;
  onBrowserOpen?: (browser: Browser) => void;
  onPageReady?: (page: Page, url: string) => void;
  proxy?: string | ProxyConfig | false | null;
}

export interface HeadlessLoginOptions {
  username: string;
  password: string;
  timeout?: number;
  userDataDir?: string;
  /** TOTP second factor */
  totpCode?: string;
  totpPrompt?: () => Promise<string>;
  totpSecret?: string;
  proxy?: string | ProxyConfig | false | null;
}

export function getTokenInteractive(options?: InteractiveLoginOptions): Promise<TokenInfo>;
export function getTokenHeadless(options: HeadlessLoginOptions): Promise<TokenInfo>;
export function loginInteractive(options?: InteractiveLoginOptions): Promise<TokenInfo>;
export function loginHeadless(options: HeadlessLoginOptions): Promise<TokenInfo>;
export function collectWebCookies(
  browser: Browser,
  options?: { names?: string[] }
): Promise<Record<string, string>>;
export declare const DEFAULT_USER_DATA_DIR: string;

declare const _default: {
  getToken: typeof getToken;
  login: typeof login;
  refreshToken: typeof refreshToken;
  refreshStoredToken: typeof refreshStoredToken;
  status: typeof status;
  logout: typeof logout;
  importGppt: typeof importGppt;
  getTokenInteractive: typeof getTokenInteractive;
  getTokenHeadless: typeof getTokenHeadless;
};

export default _default;
