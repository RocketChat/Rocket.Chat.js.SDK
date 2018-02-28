"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
}
Object.defineProperty(exports, "__esModule", { value: true });
const lru_cache_1 = __importDefault(require("lru-cache"));
/** @TODO: Remove ! post-fix expression when TypeScript #9619 resolved */
let instance;
exports.results = new Map();
exports.defaults = {
    max: 100,
    maxAge: 300 * 1000
};
/**
 * Set the instance to call methods on, with cached results
 * @param instanceToUse Instance of a class
 */
function use(instanceToUse) {
    instance = instanceToUse;
}
exports.use = use;
/**
 * Setup a cache for a method call
 * @param method Method name, for index of cached results
 * @param max Maximum size of cache
 * @param maxAge Maximum age of cache
 */
function create(method, options = {}) {
    options = Object.assign(exports.defaults, options);
    exports.results.set(method, new lru_cache_1.default(options));
    return exports.results.get(method);
}
exports.create = create;
/**
 * Get results of a prior method call or call and cache - always a promise
 * @param method Method name, to call on instance in use
 * @param key Key to pass to method call and save results against
 */
function call(method, key) {
    if (!exports.results.has(method))
        create(method); // create as needed
    const methodCache = exports.results.get(method);
    let callResults;
    if (methodCache.has(key)) {
        // return from cache if key has been used on method before
        callResults = methodCache.get(key);
    }
    else {
        // call and cache for next time, returning results
        callResults = instance[method].call(instance, key);
        methodCache.set(key, callResults);
    }
    return Promise.resolve(callResults);
}
exports.call = call;
/**
 * Get results of a prior method call
 * @param method Method name for cache to get
 * @param key Key for method result set to return
 */
function get(method, key) {
    if (exports.results.has(method))
        return exports.results.get(method).get(key);
}
exports.get = get;
/**
 * Clear a cached method call's results (all or only for given key)
 * @param method Method name for cache to clear
 * @param key Key for method result set to clear
 */
function clear(method, key) {
    if (exports.results.has(method)) {
        if (key)
            return exports.results.get(method).del(key);
        else
            return exports.results.get(method).reset();
    }
}
exports.clear = clear;
/**
 * Clear cached results for all methods
 */
function clearAll() {
    exports.results.forEach((cache) => cache.reset());
}
exports.clearAll = clearAll;
//# sourceMappingURL=methodCache.js.map