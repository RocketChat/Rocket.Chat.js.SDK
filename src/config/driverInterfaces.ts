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
 * Loggers need to provide the same set of methods
 */
export interface ILogger {
  debug: (...args: any[]) => void
  info: (...args: any[]) => void
  warning: (...args: any[]) => void
  error: (...args: any[]) => void
}

/**
 * Error-first callback param type
 */
export interface ICallback {
  (error: Error | null, ...args: any[]): void
}
