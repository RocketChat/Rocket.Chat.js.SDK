import * as settings from '../../settings'

import Api, { IRestRequest, IRestTransport } from '../api'

/**
 * The REST transport is the seam under `Api`: one `send` per request, with
 * `fetch` behind it. These specs pin both sides of that seam — what `Api` hands
 * down, and what the shipped transport turns it into on the wire.
 */

const jsonResponse = (status: number, data: any) => ({
  status,
  json: async () => data
})

// `fetch` is not on the node test environment's globals, so there is nothing to
// spy on — the mock has to be installed, and taken back off, by hand.
const mockFetch = () => {
  const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, { success: true }))
  ;(globalThis as any).fetch = fetchMock
  return fetchMock
}

const lastCall = (fetchMock: jest.Mock) => {
  const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1]
  return { url: url as string, init: init as RequestInit }
}

const recordingTransport = () => {
  const sent: IRestRequest[] = []
  const transport: IRestTransport = {
    headers: {},
    send: async (request: IRestRequest) => {
      sent.push(request)
      return { status: 200, data: { ok: true } }
    }
  }
  return { sent, transport }
}

describe('the shipped REST transport', () => {
  let fetchMock: jest.Mock
  const noFetch = (globalThis as any).fetch

  beforeEach(() => {
    fetchMock = mockFetch()
  })

  afterEach(() => {
    ;(globalThis as any).fetch = noFetch
  })

  it('puts a GET payload in the query string and sends no body', async () => {
    const api = new Api({ host: 'http://localhost:3000' })

    await api.get('users.list', { fields: { username: 1 }, roles: ['admin', 'user'] }, false)

    const { url, init } = lastCall(fetchMock)
    expect(url).toBe(
      'http://localhost:3000/api/v1/users.list?fields=%7B%22username%22%3A1%7D&roles[]=admin&roles[]=user'
    )
    expect(init.method).toBe('GET')
    expect(init.body).toBeUndefined()
  })

  it('sends a JSON body for the write methods', async () => {
    const api = new Api({ host: 'http://localhost:3000' })

    await api.post('chat.sendMessage', { msg: 'hello' }, false)

    const { url, init } = lastCall(fetchMock)
    expect(url).toBe('http://localhost:3000/api/v1/chat.sendMessage')
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{"msg":"hello"}')
  })

  it('passes FormData through unencoded', async () => {
    const api = new Api({ host: 'http://localhost:3000' })
    const upload = new FormData()
    upload.append('file', 'contents')

    await api.post('rooms.upload', upload, false)

    expect(lastCall(fetchMock).init.body).toBe(upload)
  })

  it('honours the requested API version', async () => {
    const api = new Api({ host: 'http://localhost:3000' })

    await api.get('directory', {}, false, undefined, {}, 'v2')

    expect(lastCall(fetchMock).url).toBe('http://localhost:3000/api/v2/directory?')
  })

  it('merges the settings custom headers into every request', async () => {
    jest.replaceProperty(settings, 'customHeaders', { 'X-Custom': 'from-settings' })
    const api = new Api({ host: 'http://localhost:3000' })

    await api.get('info', {}, false)

    expect(lastCall(fetchMock).init.headers).toEqual({
      'Content-Type': 'application/json',
      'X-Custom': 'from-settings'
    })
  })

  it('lets a per-request customHeaders option replace the headers entirely', async () => {
    jest.replaceProperty(settings, 'customHeaders', { 'X-Custom': 'from-settings' })
    const api = new Api({ host: 'http://localhost:3000' })

    await api.get('info', {}, false, undefined, { customHeaders: { 'X-Only': 'this' } })

    expect(lastCall(fetchMock).init.headers).toEqual({ 'X-Only': 'this' })
  })

  it('sends the auth headers a login established', async () => {
    const api = new Api({ host: 'http://localhost:3000' })
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        data: { userId: 'id', authToken: 'token', me: { username: 'user' } }
      }) as any
    )

    await api.login({ username: 'user', password: 'pass' })
    await api.get('info', {}, true)

    expect(lastCall(fetchMock).init.headers).toEqual({
      'Content-Type': 'application/json',
      'X-Auth-Token': 'token',
      'X-User-Id': 'id'
    })
  })

  it('defaults the host when none is given', async () => {
    const api = new Api({})

    await api.get('info', {}, false)

    expect(lastCall(fetchMock).url).toBe('http://localhost:3000/api/v1/info?')
  })
})

describe('Api over its transport', () => {
  it('describes the request rather than choosing a transport method per verb', async () => {
    const { sent, transport } = recordingTransport()
    const api = new Api({ transport })

    await api.put('chat.update', { msg: 'edited' }, false, undefined, {}, 'v1')

    expect(sent).toHaveLength(1)
    expect(sent[0].method).toBe('PUT')
    expect(sent[0].endpoint).toBe('chat.update')
    expect(sent[0].data).toEqual({ msg: 'edited' })
    expect(sent[0].apiVersion).toBe('v1')
  })

  it('threads its abort signal into every request', async () => {
    const { sent, transport } = recordingTransport()
    const api = new Api({ transport })

    await api.get('info', {}, false)
    expect(sent[0].options.signal.aborted).toBe(false)

    api.abort()
    expect(sent[0].options.signal.aborted).toBe(true)
  })

  // `loggedIn()` asks whether every key of `currentLogin` is truthy, and an
  // absent login has no keys — so it answers yes, and the `auth` guard in
  // `request` never fires. Pinned as-is: this refactor changes how a request
  // reaches the wire, not who is allowed to make one.
  it('sends an authenticated request even before login', async () => {
    const { sent, transport } = recordingTransport()
    const api = new Api({ transport })

    await expect(api.get('info', {}, true)).resolves.toEqual({ ok: true })
    expect(sent).toHaveLength(1)
  })

  it('rejects with the result when the status is a failure', async () => {
    const transport: IRestTransport = {
      headers: {},
      send: async () => ({ status: 401, data: { error: 'unauthorized' } })
    }
    const api = new Api({ transport })

    await expect(api.get('info', {}, false)).rejects.toEqual({
      status: 401,
      data: { error: 'unauthorized' }
    })
  })

  it('accepts a failure status the caller chose to ignore', async () => {
    const transport: IRestTransport = {
      headers: {},
      send: async () => ({ status: 401, data: { error: 'unauthorized' } })
    }
    const api = new Api({ transport })

    await expect(api.get('info', {}, false, /401/)).resolves.toEqual({ error: 'unauthorized' })
  })

  it('returns the whole result for a DELETE that carries no data', async () => {
    const transport: IRestTransport = {
      headers: {},
      send: async () => ({ status: 200, data: undefined })
    }
    const api = new Api({ transport })

    await expect(api.del('rooms.delete', {}, false)).resolves.toEqual({ status: 200, data: undefined })
  })
})
