/**
 * @module timer
 * Basic timer handling.
 */

import { ITimer } from '../interfaces'

class InternalTimer implements ITimer {
  setTimeout(callback: (...args: any[]) => void, ms: number, ...args: any[]): number | NodeJS.Timeout {
    return setTimeout(callback, ms, ...args)
  }
  clearTimeout(timeoutId: number | NodeJS.Timeout): void {
    return clearTimeout(timeoutId as NodeJS.Timeout)
  }
  setInterval(callback: (...args: any[]) => void, ms: number, ...args: any[]): number | NodeJS.Timeout {
    return setInterval(callback, ms, ...args)
  }
  clearInterval(intervalId: number | NodeJS.Timeout): void {
    return clearInterval(intervalId as NodeJS.Timeout)
  }
}

/** Default basic timer */
export let timer: ITimer = new InternalTimer()