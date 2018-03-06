import { ILogger } from '../config/driverInterfaces'

/** Temp logging, should override form adapter's log */
class InternalLog implements ILogger {
  debug (...args: any[]) {
    console.log(...args)
  }
  info (...args: any[]) {
    console.log(...args)
  }
  warning (...args: any[]) {
    console.warn(...args)
  }
  error (...args: any[]) {
    console.error(...args)
  }
}

let logger: ILogger = new InternalLog()

function replaceLog (externalLog: ILogger) {
  logger = externalLog
}

export {
  logger,
  replaceLog
}
