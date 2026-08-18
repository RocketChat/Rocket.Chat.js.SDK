import { loggedInApiWithPendingClient } from '../../../test/loggedInApi'

describe('Api abort', () => {
  it('rejects the request that was in flight', async () => {
    const { api } = await loggedInApiWithPendingClient()

    const pending = api.get('channels.list', {})
    api.abort()

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('leaves every in-flight request aborted, not only the last one', async () => {
    const { api } = await loggedInApiWithPendingClient()

    const first = api.get('channels.list', {})
    const second = api.post('chat.sendMessage', {})
    api.abort()

    await expect(first).rejects.toMatchObject({ name: 'AbortError' })
    await expect(second).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('lets a request made after an abort succeed', async () => {
    const { api, client } = await loggedInApiWithPendingClient()

    const aborted = api.get('channels.list', {})
    api.abort()
    await expect(aborted).rejects.toMatchObject({ name: 'AbortError' })

    const pending = api.get('channels.list', {})
    client.lastRequest().resolve({ status: 200, data: { channels: [] } })

    await expect(pending).resolves.toEqual({ channels: [] })
  })

  it('gives a request made after an abort a signal that is not already aborted', async () => {
    const { api, client } = await loggedInApiWithPendingClient()

    api.get('channels.list', {}).catch(() => undefined)
    const beforeAbort = client.lastRequest()
    api.abort()
    api.get('channels.list', {}).catch(() => undefined)

    expect(beforeAbort.options.signal?.aborted).toBe(true)
    expect(client.lastRequest().options.signal?.aborted).toBe(false)
  })

  it('stays usable across repeated aborts', async () => {
    const { api, client } = await loggedInApiWithPendingClient()

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
