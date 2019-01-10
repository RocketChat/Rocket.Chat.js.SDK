"use strict";
exports.__esModule = true;
/** Temp logging, should override form adapter's log */
var InternalLog = /** @class */ (function () {
    function InternalLog() {
    }
    InternalLog.prototype.debug = function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        console.log.apply(console, args);
    };
    InternalLog.prototype.info = function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        console.log.apply(console, args);
    };
    InternalLog.prototype.warning = function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        console.warn.apply(console, args);
    };
    InternalLog.prototype.warn = function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        return this.warning.apply(this, args);
    };
    InternalLog.prototype.error = function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        console.error.apply(console, args);
    };
    return InternalLog;
}());
var logger = new InternalLog();
exports.logger = logger;
function replaceLog(externalLog) {
    exports.logger = logger = externalLog;
}
exports.replaceLog = replaceLog;
function silence() {
    replaceLog({
        debug: function () { return null; },
        info: function () { return null; },
        warn: function () { return null; },
        warning: function () { return null; },
        error: function () { return null; }
    });
}
exports.silence = silence;
