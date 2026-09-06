import { Driver } from '../lib/drivers/driver'
import { ISocketOptions } from '../interfaces'
import { createSilentLogger } from './createSilentLogger'
import { driveToHandshake, fakeSockets } from './fakeTransport'

export const createDriver = (options: ISocketOptions = {}) =>
  new Driver({ host: 'localhost:3000', logger: createSilentLogger(), ...options })

export const createConnectedDriver = async (options: ISocketOptions = {}) => {
  const driver = createDriver(options)
  const constructedBefore = fakeSockets.length
  const connecting = driver.connect()
  expect(fakeSockets).toHaveLength(constructedBefore + 1)
  const transport = fakeSockets[constructedBefore]
  await driveToHandshake(transport)
  await connecting
  return { driver, transport }
}
