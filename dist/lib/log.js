"use strict";
/**
 * @module log
 * Basic log handling with ability to override when used within another module.
 */
Object.defineProperty(exports, "__esModule", { value: true });
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
exports.logger = new InternalLog();
/** Substitute logging handler */
function replaceLog(externalLog) {
    exports.logger = externalLog;
}
exports.replaceLog = replaceLog;
/** Null all log outputs */
function silence() {
    replaceLog({
        debug: () => null,
        info: () => null,
        warn: () => null,
        warning: () => null,
        error: () => null
    });
}
exports.silence = silence;
//# sourceMappingURL=log.js.map