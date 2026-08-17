import Api from '../api'
import * as settings from '../../settings'

/**
 * The default `IClient` adapter has no injection point of its own — `Api` builds
 * it when no client is handed in — so it is driven the way it runs, through an
 * `Api` and the global fetch.
 */
const fetchAnswering = (body: any, status = 200) =>
  jest.fn().mockResolvedValue({ status, json: async () => body })

const loggedInApi = async (host = 'http://localhost:3000') => {
  const api = new Api({ host })
  global.fetch = fetchAnswering({ data: { authToken: 't', userId: 'u', me: { username: 'n' } } }) as any
  await api.login({ username: 'user', password: 'pass' })
  return api
}

describe('api client', () => {
  describe('url', () => {
    it('addresses the host, api version and endpoint', async () => {
      const api = await loggedInApi()
      global.fetch = fetchAnswering({}) as any

      await api.get('me', {})

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/me?',
        expect.objectContaining({ method: 'GET' })
      )
    })

    it('addresses the api version the caller asked for', async () => {
      const api = await loggedInApi()
      global.fetch = fetchAnswering({}) as any

      await api.get('rooms.info', {}, true, undefined, {}, 'v2')

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v2/rooms.info?',
        expect.anything()
      )
    })
  })

  describe('query params', () => {
    const urlOf = () => (global.fetch as jest.Mock).mock.calls[0][0] as string

    it('encodes an array as repeated bracketed keys', async () => {
      const api = await loggedInApi()
      global.fetch = fetchAnswering({}) as any

      await api.get('rooms.info', { roomIds: ['one', 'two'] })

      expect(urlOf()).toContain('roomIds[]=one&roomIds[]=two')
    })

    it('encodes an object as json', async () => {
      const api = await loggedInApi()
      global.fetch = fetchAnswering({}) as any

      await api.get('users.list', { query: { status: 'online' } })

      expect(urlOf()).toContain(`query=${encodeURIComponent('{"status":"online"}')}`)
    })
  })

  describe('headers', () => {
    it('sends the auth headers the login installed', async () => {
      const api = await loggedInApi()
      global.fetch = fetchAnswering({}) as any

      await api.get('me', {})

      expect((global.fetch as jest.Mock).mock.calls[0][1].headers).toEqual({
        'Content-Type': 'application/json',
        'X-Auth-Token': 't',
        'X-User-Id': 'u'
      })
    })

    it('sends the custom headers the consumer set on the settings', async () => {
      jest.replaceProperty(settings, 'customHeaders', { 'X-Custom': 'yes' })
      const api = await loggedInApi()
      global.fetch = fetchAnswering({}) as any

      await api.get('me', {})

      expect((global.fetch as jest.Mock).mock.calls[0][1].headers).toMatchObject({
        'X-Custom': 'yes'
      })
    })

    it('sends only the headers the caller passed as options', async () => {
      const api = await loggedInApi()
      global.fetch = fetchAnswering({}) as any

      await api.get('me', {}, true, undefined, { customHeaders: { 'X-Only': 'this' } })

      expect((global.fetch as jest.Mock).mock.calls[0][1].headers).toEqual({ 'X-Only': 'this' })
    })
  })

  describe('body', () => {
    it('sends a json body on a post', async () => {
      const api = await loggedInApi()
      global.fetch = fetchAnswering({}) as any

      await api.post('chat.postMessage', { msg: 'hello' })

      expect((global.fetch as jest.Mock).mock.calls[0][1].body).toBe('{"msg":"hello"}')
    })

    it('sends a form body untouched on a post', async () => {
      const api = await loggedInApi()
      global.fetch = fetchAnswering({}) as any
      const form = new FormData()

      await api.post('rooms.upload', form)

      expect((global.fetch as jest.Mock).mock.calls[0][1].body).toBe(form)
    })
  })

  describe('result', () => {
    it('answers the parsed body under the http status', async () => {
      const api = await loggedInApi()
      global.fetch = fetchAnswering({ success: true }) as any

      await expect(api.get('me', {})).resolves.toEqual({ success: true })
    })

    it('rejects a body that is not json', async () => {
      const api = await loggedInApi()
      global.fetch = jest.fn().mockResolvedValue({
        status: 204,
        json: async () => { throw new Error('Unexpected end of JSON input') }
      }) as any

      await expect(api.get('me', {})).rejects.toThrow('Unexpected end of JSON input')
    })
  })
})
