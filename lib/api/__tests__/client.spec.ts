import Api from '../api'
import * as settings from '../../settings'

const fetchAnswering = (body: any, status = 200) =>
  jest.fn().mockResolvedValue({ status, json: async () => body })

const loggedInApi = async (host = 'http://localhost:3000') => {
  const api = new Api({ host })
  global.fetch = fetchAnswering({ data: { authToken: 't', userId: 'u', me: { username: 'n' } } }) as any
  await api.login({ username: 'user', password: 'pass' })
  global.fetch = fetchAnswering({}) as any
  return api
}

const fetchCall = (): { url: string, init: any } => {
  const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
  return { url, init }
}

describe('api client', () => {
  describe('url', () => {
    it('addresses the host, api version and endpoint', async () => {
      const api = await loggedInApi()

      await api.get('me', {})

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/me?',
        expect.objectContaining({ method: 'GET' })
      )
    })

    it('addresses the api version the caller asked for', async () => {
      const api = await loggedInApi()

      await api.get('rooms.info', {}, true, undefined, {}, 'v2')

      expect(fetchCall().url).toBe('http://localhost:3000/api/v2/rooms.info?')
    })

    it('addresses the endpoint on a put', async () => {
      const api = await loggedInApi()

      await api.put('chat.update', { msg: 'edited' })

      expect(fetchCall().url).toBe('http://localhost:3000/api/v1/chat.update')
    })

    it('addresses the endpoint on a delete', async () => {
      const api = await loggedInApi()

      await api.del('rooms.delete', { roomId: 'r' })

      expect(fetchCall().url).toBe('http://localhost:3000/api/v1/rooms.delete')
    })
  })

  describe('query params', () => {
    it('encodes an array as repeated bracketed keys', async () => {
      const api = await loggedInApi()

      await api.get('rooms.info', { roomIds: ['one', 'two'] })

      expect(fetchCall().url).toContain('roomIds[]=one&roomIds[]=two')
    })

    it('encodes an object as json', async () => {
      const api = await loggedInApi()

      await api.get('users.list', { query: { status: 'online' } })

      expect(fetchCall().url).toContain(`query=${encodeURIComponent('{"status":"online"}')}`)
    })
  })

  describe('headers', () => {
    it('sends the auth headers the login installed', async () => {
      const api = await loggedInApi()

      await api.get('me', {})

      expect(fetchCall().init.headers).toEqual({
        'Content-Type': 'application/json',
        'X-Auth-Token': 't',
        'X-User-Id': 'u'
      })
    })

    it('sends the custom headers the consumer set on the settings', async () => {
      jest.replaceProperty(settings, 'customHeaders', { 'X-Custom': 'yes' })
      const api = await loggedInApi()

      await api.get('me', {})

      expect(fetchCall().init.headers).toMatchObject({ 'X-Custom': 'yes' })
    })

    it('sends only the headers the caller passed as options', async () => {
      const api = await loggedInApi()

      await api.get('me', {}, true, undefined, { customHeaders: { 'X-Only': 'this' } })

      expect(fetchCall().init.headers).toEqual({ 'X-Only': 'this' })
    })
  })

  describe('body', () => {
    it('sends a json body on a post', async () => {
      const api = await loggedInApi()

      await api.post('chat.postMessage', { msg: 'hello' })

      expect(fetchCall().init.body).toBe('{"msg":"hello"}')
    })

    it('sends a form body untouched on a post', async () => {
      const api = await loggedInApi()
      const form = new FormData()

      await api.post('rooms.upload', form)

      expect(fetchCall().init.body).toBe(form)
    })

    it('sends a json body on a put', async () => {
      const api = await loggedInApi()

      await api.put('chat.update', { msg: 'edited' })

      expect(fetchCall().init).toMatchObject({ method: 'PUT', body: '{"msg":"edited"}' })
    })

    it('sends a json body on a delete', async () => {
      const api = await loggedInApi()

      await api.del('rooms.delete', { roomId: 'r' })

      expect(fetchCall().init).toMatchObject({ method: 'DELETE', body: '{"roomId":"r"}' })
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
