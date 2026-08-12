import Api from '../api'
import * as settings from '../../settings'

// `fetch` is not a configurable own property of the test global, so jest cannot
// spy on it — the fake is installed and taken away by hand instead.
const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
const realFetch = globalThis.fetch

const respondWith = (status: number, body: any) => {
  fetchMock.mockResolvedValue({ status, json: async () => body } as any)
}

const createApi = (host?: string) => new Api({ host })

const lastCall = () => fetchMock.mock.calls[fetchMock.mock.calls.length - 1]
const requestedUrl = () => lastCall()[0]
const requestedInit = () => lastCall()[1] as RequestInit

beforeEach(() => {
  globalThis.fetch = fetchMock as unknown as typeof fetch
  fetchMock.mockReset()
  respondWith(200, {})
})

afterEach(() => {
  globalThis.fetch = realFetch
})

describe('the url the default client builds', () => {
  it('carries a GET payload in the query string', async () => {
    await createApi('http://host').get('users.list', { fields: { username: 1 } }, false)

    expect(requestedUrl()).toBe(
      'http://host/api/v1/users.list?fields=%7B%22username%22%3A1%7D'
    )
    expect(requestedInit().body).toBeUndefined()
  })

  it('repeats an array param per value', async () => {
    await createApi('http://host').get('rooms.get', { types: ['c', 'p'] }, false)

    expect(requestedUrl()).toBe('http://host/api/v1/rooms.get?types[]=c&types[]=p')
  })

  it('leaves the query empty when a GET carries no payload', async () => {
    await createApi('http://host').get('info', {}, false)

    expect(requestedUrl()).toBe('http://host/api/v1/info?')
  })

  it('uses the api version it was given', async () => {
    await createApi('http://host').get('info', {}, false, undefined, {}, 'v2')

    expect(requestedUrl()).toBe('http://host/api/v2/info?')
  })

  it('defaults the host when none was configured', async () => {
    await createApi().get('info', {}, false)

    expect(requestedUrl()).toBe('http://localhost:3000/api/v1/info?')
  })
})

describe('the body the default client sends', () => {
  it.each(['post', 'put', 'del'] as const)('serializes the payload for %s', async (verb) => {
    await createApi('http://host')[verb]('chat.update', { msgId: 'message-id' }, false)

    expect(requestedUrl()).toBe('http://host/api/v1/chat.update')
    expect(requestedInit().body).toBe('{"msgId":"message-id"}')
  })

  it.each([
    ['post', 'POST'],
    ['put', 'PUT'],
    ['del', 'DELETE'],
    ['get', 'GET']
  ] as const)('sends %s as %s', async (verb, method) => {
    await createApi('http://host')[verb]('chat.update', {}, false)

    expect(requestedInit().method).toBe(method)
  })

  it('sends a FormData payload untouched', async () => {
    const payload = new FormData()
    await createApi('http://host').post('rooms.upload', payload, false)

    expect(requestedInit().body).toBe(payload)
  })
})

describe('the headers the default client sends', () => {
  it('sends json content type alongside the shared custom headers', async () => {
    jest.replaceProperty(settings, 'customHeaders', { 'X-Custom': 'shared' })

    await createApi('http://host').get('info', {}, false)

    expect(requestedInit().headers).toEqual({
      'Content-Type': 'application/json',
      'X-Custom': 'shared'
    })
  })

  it('lets the login headers win over the shared custom headers', async () => {
    jest.replaceProperty(settings, 'customHeaders', { 'X-Auth-Token': 'shared' })
    const api = createApi('http://host')
    respondWith(200, { data: { authToken: 'auth-token', userId: 'user-id', me: { username: 'user' } } })
    await api.login({ username: 'user', password: 'pass' })

    await api.get('info', {}, false)

    expect((requestedInit().headers as any)['X-Auth-Token']).toBe('auth-token')
  })

  it('replaces every header when the caller supplies its own', async () => {
    jest.replaceProperty(settings, 'customHeaders', { 'X-Custom': 'shared' })

    await createApi('http://host').get('info', {}, false, undefined, {
      customHeaders: { 'X-Only': 'mine' }
    })

    expect(requestedInit().headers).toEqual({ 'X-Only': 'mine' })
  })
})

describe('what the default client returns', () => {
  it('pairs the status with the parsed body', async () => {
    respondWith(200, { success: true })

    await expect(createApi('http://host').get('info', {}, false)).resolves.toEqual({ success: true })
  })

  it('hands the abort signal to fetch', async () => {
    const api = createApi('http://host')
    await api.get('info', {}, false)

    expect(requestedInit().signal).toBeInstanceOf(AbortSignal)
    expect(requestedInit().signal!.aborted).toBe(false)

    api.abort()

    expect(requestedInit().signal!.aborted).toBe(true)
  })
})
