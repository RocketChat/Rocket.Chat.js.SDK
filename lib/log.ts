/**
 * @module log
 * Basic log handling with ability to override when used within another module.
 */

import { ILogger } from '../interfaces'

/** Refer to ADR-0005. */
const silentLogger: ILogger = {
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

/** Return to the silent fallback logger */
export function silence () {
  replaceLog(silentLogger)
}
