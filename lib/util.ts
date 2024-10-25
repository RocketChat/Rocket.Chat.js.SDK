/** A function that emits a side effect and does not return anything. */
export type Procedure = (...args: any[]) => void

/** Delay invocation of a function until some time after it was last called */
export function debounce<F extends Procedure> (
  func: F,
  waitMilliseconds = 100,
  immediate = false
): F {
  let timeout: NodeJS.Timer | undefined
  return function (this: any, ...args: any[]) {
    const self = this
    const doLater = function () {
      timeout = undefined
      if (!immediate) func.apply(self, args)
    }
    const callNow = immediate && timeout === undefined
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(doLater, waitMilliseconds)
    if (callNow) func.apply(self, args)
  } as any
}

/** Convert a http/s protocol address to a websocket URL */
export function hostToWS (host: string, ssl = false) {
  host = host.replace(/^(https?:\/\/)?/, '')
  return `ws${ssl ? 's' : ''}://${host}`
}
