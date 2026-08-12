import { DDPDriver } from '../ddp'
import { IDriver, ILiveness } from '../index'
import { ISocketOptions } from '../../../interfaces'
import { silentLogger } from '../../../test/silentLogger'
import {
  fakeSockets,
  openFakeConnection,
  useFakeClockAndSocketRegistry
} from '../../../test/fakeTransport'

// Same seam as the other driver specs. See test/fakeTransport.ts.
jest.mock('universal-websocket-client', () => require('../../../test/fakeTransport').fakeTransportModule)

useFakeClockAndSocketRegistry()

const createDriver = (options: ISocketOptions = {}) =>
  new DDPDriver({ host: 'localhost:3000', logger: silentLogger, ...options })

/**
 * Every test here reads the driver through an annotated `IDriver` or
 * `ILiveness`, never through the class, so a member that leaves the contract
 * fails the test program before it can fail a consumer.
 */
describe('IDriver', () => {
  it('carries the liveness surface, answered from the driver\'s own config', () => {
    const liveness: ILiveness = createDriver({ timeout: 250 })

    expect(liveness.pingInterval).toBe(250)
    expect(liveness.connected).toBe(false)
    expect(liveness.lastPing).toBeGreaterThan(0)
  })

  it('probes false through the contract while no socket has been built', async () => {
    const contract: IDriver = createDriver()

    await expect(contract.probe()).resolves.toBe(false)
  })

  it('probes true through the contract on the server\'s pong', async () => {
    const driver = createDriver()
    const contract: IDriver = driver
    const transport = await openFakeConnection(driver.ddp)

    const probing = contract.probe(2000)

    expect(transport.lastSent()).toEqual({ msg: 'ping' })
    transport.receive({ msg: 'pong' })

    await expect(probing).resolves.toBe(true)
  })

  it('reaches the transport through the contract\'s reopen doors', async () => {
    const contract: IDriver = createDriver()

    contract.checkAndReopen()
    expect(fakeSockets).toHaveLength(1)

    contract.reopenNow()
    await jest.advanceTimersByTimeAsync(0)
    expect(fakeSockets).toHaveLength(2)
  })
})
