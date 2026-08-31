import { Socket } from '../lib/drivers/socket'
import { ILogger, ISocketOptions } from '../interfaces'
import { createSilentLogger } from './createSilentLogger'

/**
 * The delay a Scheduled Reopen waits out, read from the `reopen` option.
 * Deliberately *not* the 10000 default, and deliberately not the deadline below:
 * with either, a boundary assertion would pass whether or not the driver read
 * the option, and the two timers would be indistinguishable on the clock.
 */
export const REOPEN_DELAY = 3000

/**
 * The `timeout` option: the Deadline of one Connection Attempt, and the bound a
 * send waits on its DDP response. Deliberately neither the 10000 default nor
 * `REOPEN_DELAY`, so the assertions distinguish all three.
 */
export const TIMEOUT = 7000

export const PING_INTERVAL_OUTSIDE_TEST_WINDOW = 10 * 60 * 1000

export const socketOptions = { reopen: REOPEN_DELAY, timeout: TIMEOUT, ping: PING_INTERVAL_OUTSIDE_TEST_WINDOW }

export const createSocket = (options: ISocketOptions & { logger?: ILogger } = {}) =>
  new Socket({ host: 'localhost:3000', logger: createSilentLogger(), ...options })
