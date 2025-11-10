/**
 * Pixiv Token Getter - TypeScript Type Definitions
 */

/**
 * Interactive login options
 */
export interface InteractiveLoginOptions {
  /** Use headless mode, default false */
  headless?: boolean;
  /** Timeout in milliseconds, default 300000 (5 minutes) */
  timeout?: number;
  /** Callback when browser opens */
  onBrowserOpen?: (browser: any) => void;
  /** Callback when page is ready */
  onPageReady?: (page: any, url: string) => void;
}

/**
 * Headless login options
 */
export interface HeadlessLoginOptions {
  /** Username (required) */
  username: string;
  /** Password (required) */
  password: string;
  /** Timeout in milliseconds, default 120000 (2 minutes) */
  timeout?: number;
}

/**
 * User information
 */
export interface UserInfo {
  /** User ID */
  id: string;
  /** Username */
  name: string;
  /** User account */
  account: string;
  /** Other user information */
  [key: string]: any;
}

/**
 * Token information
 */
export interface TokenInfo {
  /** Access token */
  access_token: string;
  /** Refresh token */
  refresh_token: string;
  /** Expiration time (seconds) */
  expires_in: number;
  /** Token type (usually 'bearer') */
  token_type: string;
  /** Permission scope */
  scope: string;
  /** User information */
  user: UserInfo;
}

/**
 * Get token via interactive login
 * @param options Login options
 * @returns Promise<TokenInfo> Token information
 * 
 * @example
 * ```typescript
 * const token = await getTokenInteractive();
 * console.log(token.access_token);
 * ```
 */
export function getTokenInteractive(options?: InteractiveLoginOptions): Promise<TokenInfo>;

/**
 * Get token via headless login (username/password)
 * @param options Login options
 * @returns Promise<TokenInfo> Token information
 * 
 * @example
 * ```typescript
 * const token = await getTokenHeadless({
 *   username: 'your_username',
 *   password: 'your_password'
 * });
 * ```
 */
export function getTokenHeadless(options: HeadlessLoginOptions): Promise<TokenInfo>;

/**
 * Low-level API: Interactive login
 */
export function loginInteractive(options?: InteractiveLoginOptions): Promise<TokenInfo>;

/**
 * Low-level API: Headless login
 */
export function loginHeadless(options: HeadlessLoginOptions): Promise<TokenInfo>;

/**
 * Default export
 */
declare const _default: {
  getTokenInteractive: typeof getTokenInteractive;
  getTokenHeadless: typeof getTokenHeadless;
};

export default _default;
