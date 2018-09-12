import LRU from 'lru-cache'
import { logger } from './log'

/** @TODO: Remove ! post-fix expression when TypeScript #9619 resolved */
export let instance: any
export const results: Map<string, LRU.Cache<string, any>> = new Map()
export const defaults: LRU.Options = {
  max: 100,
  maxAge: 300 * 1000
}

/**
 * Set the instance to call methods on, with cached results.
 * @param instanceToUse Instance of a class
 */
export function use (instanceToUse: object): void {
  instance = instanceToUse
}

/**
 * Setup a cache for a method call.
 * @param method Method name, for index of cached results
 * @param options.max Maximum size of cache
 * @param options.maxAge Maximum age of cache
 */
export function create (method: string, options: LRU.Options = {}): LRU.Cache<string, any> | undefined {
  options = Object.assign(defaults, options)
  results.set(method, new LRU(options))
  return results.get(method)
}

/**
 * Get results of a prior method call or call and cache.
 * @param method Method name, to call on instance in use
 * @param key Key to pass to method call and save results against
 */
export async function call (method: string, key: string): Promise<any> {
  if (!results.has(method)) create(method) // create as needed
  const methodCache = results.get(method)!

  if (methodCache.has(key)) {
    logger.debug(`[${method}] Calling (cached): ${key}`)
    // return from cache if key has been used on method before
    return methodCache.get(key)
  }
    // call and cache for next time, returning results
  logger.debug(`[${method}] Calling (caching): ${key}`)
  const { result: callResults } = await Promise.resolve(instance.call(method, key))
  methodCache.set(key, callResults)
  return callResults
}

/**
 * Proxy for checking if method has been cached.
 * Cache may exist from manual creation, or prior call.
 * @param method Method name for cache to get
 */
export function has (method: string): boolean {
  return results.has(method)
}

/**
 * Get results of a prior method call.
 * @param method Method name for cache to get
 * @param key Key for method result set to return
 */
export function get (method: string, key: string): LRU.Cache<string, any> | undefined {
  if (results.has(method)) return results.get(method)!.get(key)
}

/**
 * Reset a cached method call's results (all or only for given key).
 * @param method Method name for cache to clear
 * @param key Key for method result set to clear
 */
export function reset (method: string, key?: string): void {
  if (results.has(method)) {
    if (key) return results.get(method)!.del(key)
    else return results.get(method)!.reset()
  }
}

/**
 * Reset cached results for all methods.
 */
export function resetAll (): void {
  results.forEach((cache) => cache.reset())
}
