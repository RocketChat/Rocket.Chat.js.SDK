/**
 * @module log
 * Basic log handling with ability to override when used within another module.
 */

import { ILogger } from '../interfaces'

const noopLogger: ILogger = {
  debug: () => null,
  info: () => null,
  warning: () => null,
  warn (...args: any[]) { return this.warning(...args) },
  error: () => null
}

export let logger: ILogger = noopLogger

/** Substitute logging handler */
export function replaceLog (externalLog: ILogger) {
  logger = externalLog
}

/** Null all log outputs */
export function silence () {
  replaceLog(noopLogger)
}
