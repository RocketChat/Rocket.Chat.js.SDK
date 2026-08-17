import Api from '../api'
import { FakeClient } from '../../../test/fakeClient'

const loggedInApi = () => {
  const client = new FakeClient()
  const api = new Api({ client })
  api.currentLogin = {
    username: 'user',
    userId: 'id',
    authToken: 'token',
    result: {} as any
  }
  return { api, client }
}

describe('Api abort', () => {
  it('rejects the request that was in flight', async () => {
    const { api } = loggedInApi()

    const pending = api.get('channels.list', {})
    api.abort()

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('leaves every in-flight request aborted, not only the last one', async () => {
    const { api } = loggedInApi()

    const first = api.get('channels.list', {})
    const second = api.post('chat.sendMessage', {})
    api.abort()

    await expect(first).rejects.toMatchObject({ name: 'AbortError' })
    await expect(second).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('lets a request made after an abort succeed', async () => {
    const { api, client } = loggedInApi()

    const aborted = api.get('channels.list', {})
    api.abort()
    await expect(aborted).rejects.toMatchObject({ name: 'AbortError' })

    const pending = api.get('channels.list', {})
    client.lastRequest().resolve({ status: 200, data: { channels: [] } })

    await expect(pending).resolves.toEqual({ channels: [] })
  })

  it('gives a request made after an abort a signal that is not already aborted', async () => {
    const { api, client } = loggedInApi()

    api.get('channels.list', {}).catch(() => undefined)
    api.abort()
    api.get('channels.list', {}).catch(() => undefined)

    expect(client.requests[0].options.signal?.aborted).toBe(true)
    expect(client.lastRequest().options.signal?.aborted).toBe(false)
  })

  it('stays usable across repeated aborts', async () => {
    const { api, client } = loggedInApi()

    const first = api.get('channels.list', {})
    api.abort()
    const second = api.get('channels.list', {})
    api.abort()

    await expect(first).rejects.toMatchObject({ name: 'AbortError' })
    await expect(second).rejects.toMatchObject({ name: 'AbortError' })

    const afterwards = api.get('channels.list', {})
    client.lastRequest().resolve({ status: 200, data: { channels: [] } })
    await expect(afterwards).resolves.toEqual({ channels: [] })
  })
})
