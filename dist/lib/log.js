"use strict";
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
let logger = new InternalLog();
exports.logger = logger;
function replaceLog(externalLog) {
    exports.logger = logger = externalLog;
}
exports.replaceLog = replaceLog;
//# sourceMappingURL=log.js.map