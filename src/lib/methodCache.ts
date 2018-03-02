import LRU from 'lru-cache'

/** @TODO: Remove ! post-fix expression when TypeScript #9619 resolved */
let instance: any
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
export function call (method: string, key: string): Promise<any> {
  if (!results.has(method)) create(method) // create as needed
  const methodCache = results.get(method)!
  let callResults

  if (methodCache.has(key)) {
    console.log(`[${method}] Calling (cached): ${key}`)
    // return from cache if key has been used on method before
    callResults = methodCache.get(key)
  } else {
    // call and cache for next time, returning results
    console.log(`[${method}] Calling (caching): ${key}`)
    callResults = instance.call(method, key).result
    methodCache.set(key, callResults)
  }
  return Promise.resolve(callResults)
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
 * Clear a cached method call's results (all or only for given key).
 * @param method Method name for cache to clear
 * @param key Key for method result set to clear
 */
export function clear (method: string, key?: string): void {
  if (results.has(method)) {
    if (key) return results.get(method)!.del(key)
    else return results.get(method)!.reset()
  }
}

/**
 * Clear cached results for all methods.
 */
export function clearAll (): void {
  results.forEach((cache) => cache.reset())
}
