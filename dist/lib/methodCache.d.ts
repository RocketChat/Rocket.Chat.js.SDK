/// <reference types="lru-cache" />
import LRU from 'lru-cache';
export declare const results: Map<string, LRU.Cache<string, any>>;
export declare const defaults: LRU.Options;
/**
 * Set the instance to call methods on, with cached results.
 * @param instanceToUse Instance of a class
 */
export declare function use(instanceToUse: object): void;
/**
 * Setup a cache for a method call.
 * @param method Method name, for index of cached results
 * @param options.max Maximum size of cache
 * @param options.maxAge Maximum age of cache
 */
export declare function create(method: string, options?: LRU.Options): LRU.Cache<string, any> | undefined;
/**
 * Get results of a prior method call or call and cache.
 * @param method Method name, to call on instance in use
 * @param key Key to pass to method call and save results against
 */
export declare function call(method: string, key: string): Promise<any>;
/**
 * Get results of a prior method call.
 * @param method Method name for cache to get
 * @param key Key for method result set to return
 */
export declare function get(method: string, key: string): LRU.Cache<string, any> | undefined;
/**
 * Clear a cached method call's results (all or only for given key).
 * @param method Method name for cache to clear
 * @param key Key for method result set to clear
 */
export declare function clear(method: string, key?: string): void;
/**
 * Clear cached results for all methods.
 */
export declare function clearAll(): void;
