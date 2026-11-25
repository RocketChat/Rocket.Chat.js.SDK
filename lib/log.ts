/**
 * @module log
 * Default silent logger. Callers inject a logger per instance instead.
 */

import { ILogger } from '../interfaces'

const noopLogger: ILogger = {
  debug: () => null,
  info: () => null,
  warning: () => null,
  warn (...args: any[]) { return this.warning(...args) },
  error: () => null
}

export const isLoggerSilent = (candidate: ILogger) => candidate === noopLogger

export const logger: ILogger = noopLogger
