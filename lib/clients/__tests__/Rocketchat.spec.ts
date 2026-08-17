import RocketChatClient from '../Rocketchat'
import { Driver } from '../../drivers/driver'
import { createSilentLogger } from '../../../test/createSilentLogger'

jest.mock('universal-websocket-client', () => require('../../../test/fakeTransport').fakeTransportModule)

const createClient = () =>
  new RocketChatClient({ host: 'localhost:3000', logger: createSilentLogger() })

describe('client.ddp', () => {
  it('is the Driver', () => {
    const client = createClient()

    expect(client.ddp).toBeInstanceOf(Driver)
  })

  it('receives method calls made on the client', async () => {
    const client = createClient()
    const methodCall = jest.spyOn(client.ddp, 'methodCall').mockResolvedValue(undefined as any)

    await client.methodCall('getRoomIdByNameOrId', 'general')

    expect(methodCall).toHaveBeenCalledWith('getRoomIdByNameOrId', 'general')
  })

  it('receives room subscriptions made on the client', async () => {
    const client = createClient()
    const subscribeRoom = jest.spyOn(client.ddp, 'subscribeRoom').mockResolvedValue([])

    await client.subscribeRoom('GENERAL')

    expect(subscribeRoom).toHaveBeenCalledWith('GENERAL')
  })

  it('receives subscriptions made on the client, with the arguments in order', async () => {
    const client = createClient()
    const subscribe = jest.spyOn(client.ddp, 'subscribe').mockResolvedValue(undefined)

    await client.subscribe('stream-room-messages', 'GENERAL', false)

    expect(subscribe).toHaveBeenCalledWith('stream-room-messages', 'GENERAL', false)
  })

  it('is not exposed on the client under a socket field', () => {
    expect('socket' in createClient()).toBe(false)
  })
})

describe('client.url', () => {
  it('resolves to the driver host', async () => {
    expect(await createClient().url).toBe('localhost:3000')
  })
})
