import RocketChatClient from '../Rocketchat'
import { Driver } from '../../drivers/driver'
import { createSilentLogger } from '../../../test/createSilentLogger'

// Same seam as the driver specs: the client builds its Driver, the Driver builds
// its Socket, the Socket builds the fake through its normal code path.
jest.mock('universal-websocket-client', () => require('../../../test/fakeTransport').fakeTransportModule)

const createClient = () =>
  new RocketChatClient({ host: 'localhost:3000', logger: createSilentLogger() })

describe('client.ddp', () => {
  it('is the Driver, held directly rather than behind a Promise', () => {
    const client = createClient()

    expect(client.ddp).toBeInstanceOf(Driver)
  })

  it('reaches the driver without awaiting', async () => {
    const client = createClient()
    const methodCall = jest.spyOn(client.ddp, 'methodCall').mockResolvedValue(undefined as any)

    await client.ddp.methodCall('getRoomIdByNameOrId', 'general')

    expect(methodCall).toHaveBeenCalledWith('getRoomIdByNameOrId', 'general')
  })

  it('is what the client delegates to', async () => {
    const client = createClient()
    const subscribeRoom = jest.spyOn(client.ddp, 'subscribeRoom').mockResolvedValue([])

    await client.subscribeRoom('GENERAL')

    expect(subscribeRoom).toHaveBeenCalledWith('GENERAL')
  })

  it('is the only name the client holds it under', () => {
    expect('socket' in createClient()).toBe(false)
  })
})

describe('client.url', () => {
  it('still resolves to the driver host', async () => {
    expect(await createClient().url).toBe('localhost:3000')
  })
})
