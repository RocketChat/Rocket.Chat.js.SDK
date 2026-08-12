import { DDPDriver } from '../ddp'
import { IDriver } from '../index'
import { silentLogger } from '../../../test/silentLogger'

/**
 * Annotated as `IDriver`, which is the assertion: the members read below have to
 * be on the contract for the test program to compile, and the probe and both
 * reopen doors have to stay on it for this line to.
 */
const driver: IDriver = new DDPDriver({ host: 'localhost:3000', ping: 250, logger: silentLogger })

describe('IDriver', () => {
  it('reports the liveness state through the contract rather than through the socket', () => {
    expect(driver.pingInterval).toBe(250)
    expect(driver.connected).toBe(false)
    expect(driver.lastPing).toBeGreaterThan(0)
  })
})
