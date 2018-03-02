/**
 * Connection options type
 * @param host Rocket.Chat instance Host URL:PORT (without protocol)
 * @param timeout How long to wait (ms) before abandoning connection
 */
export interface IOptions {
  host?: string,
  useSsl?: boolean,
  timeout?: number
}

/**
 * Error-first callback param type
 */
export interface ICallback {
  (error: Error | null, ...args: any[]): void
}
