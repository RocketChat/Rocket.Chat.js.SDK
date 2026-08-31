/**
 * @module log
 * Basic log handling with ability to override when used within another module.
 */

import { ILogger } from '../interfaces'

/** Temp logging, should override form adapter's log */
class InternalLog implements ILogger {
  debug (..._args: any[]) {
    // console.log(...args)
  }
  info (..._args: any[]) {
    // console.log(...args)
  }
  warning (..._args: any[]) {
    // console.log(...args)
  }
  warn (...args: any[]) { // legacy method
    return this.warning(...args)
  }
  error (..._args: any[]) {
    // console.log(...args)
  }
}

/** Default basic console logging */
export const logger: ILogger = new InternalLog()