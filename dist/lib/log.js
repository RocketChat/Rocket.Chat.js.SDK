/**
 * @module log
 * Basic log handling with ability to override when used within another module.
 */
/** Temp logging, should override form adapter's log */
class InternalLog {
    debug(...args) {
        console.log(...args);
    }
    info(...args) {
        console.log(...args);
    }
    warning(...args) {
        console.warn(...args);
    }
    warn(...args) {
        return this.warning(...args);
    }
    error(...args) {
        console.error(...args);
    }
}
/** Default basic console logging */
export let logger = new InternalLog();
/** Substitute logging handler */
export function replaceLog(externalLog) {
    logger = externalLog;
}
/** Null all log outputs */
export function silence() {
    replaceLog({
        debug: () => null,
        info: () => null,
        warn: () => null,
        warning: () => null,
        error: () => null
    });
}
//# sourceMappingURL=log.js.map