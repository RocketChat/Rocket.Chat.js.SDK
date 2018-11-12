/**
 * @module log
 * Basic log handling with ability to override when used within another module.
 */

import { ILogger } from '../interfaces'

/** Temp logging, should override form adapter's log */
class InternalLog implements ILogger {
  debug (...args: any[]) {
    // console.log(...args)
  }
  info (...args: any[]) {
    // console.log(...args)
  }
  warning (...args: any[]) {
    // console.warn(...args)
  }
  warn (...args: any[]) { // legacy method
    return this.warning(...args)
  }
  error (...args: any[]) {
    // console.error(...args)
  }
}

/** Default basic console logging */
export let logger: ILogger = new InternalLog()

/** Substitute logging handler */
export function replaceLog (externalLog: ILogger) {
  logger = externalLog
}

/** Null all log outputs */
export function silence () {
  replaceLog({
    debug: () => null,
    info: () => null,
    warn: () => null,
    warning: () => null,
    error: () => null
  })
}
