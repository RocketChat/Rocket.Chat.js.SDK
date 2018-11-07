/** Delay invocation of a function until some time after it was last called */
export function debounce(func, waitMilliseconds = 100, immediate = false) {
    let timeout;
    return function (...args) {
        const self = this;
        const doLater = function () {
            timeout = undefined;
            if (!immediate)
                func.apply(self, args);
        };
        const callNow = immediate && timeout === undefined;
        if (timeout)
            clearTimeout(timeout);
        timeout = setTimeout(doLater, waitMilliseconds);
        if (callNow)
            func.apply(self, args);
    };
}
/** Convert a http/s protocol address to a websocket URL */
export function hostToWS(host, ssl = false) {
    host = host.replace(/^(https?:\/\/)?/, '');
    return `ws${ssl ? 's' : ''}://${host}`;
}
//# sourceMappingURL=util.js.map