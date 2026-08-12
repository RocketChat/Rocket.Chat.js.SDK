/**
 * @module log
 * Basic log handling with ability to override when used within another module.
 */

import { ILogger } from '../interfaces'

/**
 * The fallback logger, used by any SDK object whose caller supplied none. It
 * writes nothing, so an SDK embedded in another app stays quiet until that app
 * hands over a logger of its own. Refer to ADR-0005.
 */
export const silentLogger: ILogger = {
  debug: () => undefined,
  info: () => undefined,
  warning: () => undefined,
  warn: () => undefined,
  error: () => undefined
}

/** The logger an SDK object falls back to when its caller supplied none. */
export let logger: ILogger = silentLogger

/** Substitute logging handler */
export function replaceLog (externalLog: ILogger) {
  logger = externalLog
}

/** Null all log outputs */
export function silence () {
  replaceLog(silentLogger)
}
