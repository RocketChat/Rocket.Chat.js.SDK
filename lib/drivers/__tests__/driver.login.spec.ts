import { createConnectedDriver, createDriver } from '../../../test/createDriver'
import {
  answerLastMethodCall,
  errorLastMethodCall,
  driveToHandshake,
  fakeSockets,
  useFakeClockAndSocketRegistry
} from '../../../test/fakeTransport'

jest.mock('universal-websocket-client', () => require('../../../test/fakeTransport').fakeTransportModule)

useFakeClockAndSocketRegistry()

describe('Driver.login', () => {
  it('records the user id the server logged in', async () => {
    const { driver, transport } = await createConnectedDriver()

    const logging = driver.login({ resume: 'resume-token' })
    expect(transport.lastSent()).toMatchObject({
      msg: 'method',
      method: 'login',
      params: [{ resume: 'resume-token' }]
    })

    answerLastMethodCall(transport, { id: 'user-id', token: 'auth-token' })

    await expect(logging).resolves.toMatchObject({ id: 'user-id' })
    expect(driver.userId).toBe('user-id')
  })

  it('opens the connection first when the socket is not connected', async () => {
    const driver = createDriver()
    expect(driver.connected).toBe(false)

    const logging = driver.login({ resume: 'resume-token' })

    expect(fakeSockets).toHaveLength(1)
    await driveToHandshake(fakeSockets[0])

    answerLastMethodCall(fakeSockets[0], { id: 'user-id', token: 'auth-token' })
    await expect(logging).resolves.toMatchObject({ id: 'user-id' })
  })

  it('rejects and leaves the user id unset when the server refuses', async () => {
    const { driver, transport } = await createConnectedDriver()

    const logging = driver.login({ username: 'user', password: 'pass' })
    errorLastMethodCall(transport, { error: 403, message: 'Unauthorized' })

    await expect(logging).rejects.toThrow('Unauthorized')
    expect(driver.userId).toBe('')
  })
})

describe('Driver.connect', () => {
  it('returns without opening a second connection when already connected', async () => {
    const { driver } = await createConnectedDriver()

    await expect(driver.connect()).resolves.toBe(driver)
    expect(fakeSockets).toHaveLength(1)
  })
})
