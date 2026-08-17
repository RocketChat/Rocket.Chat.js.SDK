import Api from '../api'
import { logger as moduleLogger } from '../../log'
import { createSilentLogger } from '../../../test/createSilentLogger'
import { FakeClient } from '../../../test/fakeClient'
import { apiWithFakeClient, loggedInApiWithFakeClient } from '../../../test/loggedInApi'

describe('api', () => {
  describe('login', () => {
    it('installs the auth headers the following requests need', async () => {
      const { client } = await loggedInApiWithFakeClient()

      expect(client.headers).toEqual({
        'X-Auth-Token': 'fake-token',
        'X-User-Id': 'fake-user-id'
      })
    })

    it('records the identity the login answered with', async () => {
      const { api } = await loggedInApiWithFakeClient()

      expect(api.userId).toBe('fake-user-id')
      expect(api.username).toBe('fake-username')
      expect(api.loggedIn()).toBe(true)
    })
  })

  describe('logout', () => {
    it('answers nothing without asking the server when there is no login', async () => {
      const client = new FakeClient()
      const api = apiWithFakeClient(client)

      await expect(api.logout()).resolves.toBeNull()
      expect(client.requests).toHaveLength(0)
    })

    it('clears the identity once the server has answered', async () => {
      const { api, client } = await loggedInApiWithFakeClient()

      await api.logout()

      expect(api.userId).toBe('')
      expect(api.username).toBeNull()
      expect(client.lastRequest().url).toBe('logout')
    })
  })

  describe('request', () => {
    it('reaches the client for an authenticated request even with no login', async () => {
      const client = new FakeClient()
      const api = apiWithFakeClient(client)

      await api.get('me', {})

      expect(api.loggedIn()).toBe(true)
      expect(client.lastRequest().method).toBe('get')
    })

    it('reaches the client for an unauthenticated request when logged out', async () => {
      const client = new FakeClient()
      const api = apiWithFakeClient(client)

      await api.post('login', { username: 'user' }, false)

      expect(client.lastRequest()).toMatchObject({
        method: 'post',
        data: { username: 'user' }
      })
    })

    it('routes each method to its own client call', async () => {
      const { api, client } = await loggedInApiWithFakeClient()

      await api.get('a', {})
      await api.post('b', {})
      await api.put('c', {})
      await api.del('d', {})

      expect(client.requests.map((request) => request.method)).toEqual([
        'post',
        'get',
        'post',
        'put',
        'delete'
      ])
    })

    it('passes the body the caller asked for through to the client', async () => {
      const { api, client } = await loggedInApiWithFakeClient()

      await api.post('chat.postMessage', { msg: 'hello' })
      expect(client.lastRequest().data).toEqual({ msg: 'hello' })

      await api.put('chat.update', { msg: 'edited' })
      expect(client.lastRequest().data).toEqual({ msg: 'edited' })
    })

    it('passes the api version through to the client', async () => {
      const { api, client } = await loggedInApiWithFakeClient()

      await api.get('rooms.info', {}, true, undefined, {}, 'v2')

      expect(client.lastRequest().apiVersion).toBe('v2')
    })

    it('carries the abort signal on every request', async () => {
      const { api, client } = await loggedInApiWithFakeClient()

      await api.get('me', {})

      expect(client.lastRequest().options.signal).toBe(api.controller.signal)
    })

    it('answers with the body of the result', async () => {
      const { api, client } = await loggedInApiWithFakeClient()
      client.reply('get', { status: 200, data: { success: true } })

      await expect(api.get('me', {})).resolves.toEqual({ success: true })
    })

    it('throws the result itself when the status is a failure', async () => {
      const { api, client } = await loggedInApiWithFakeClient()
      const failed = { status: 400, data: { error: 'nope' } }
      client.reply('get', failed)

      await expect(api.get('me', {})).rejects.toBe(failed)
    })

    it('accepts a failure status the caller asked to ignore', async () => {
      const { api, client } = await loggedInApiWithFakeClient()
      client.reply('get', { status: 400, data: { error: 'nope' } })

      await expect(api.get('me', {}, true, /400/)).resolves.toEqual({ error: 'nope' })
    })

    it('throws when the client answers nothing at all', async () => {
      const { api, client } = await loggedInApiWithFakeClient()
      client.reply('get', undefined)

      await expect(api.get('me', {})).rejects.toThrow('API GET me result undefined')
    })

    it('answers a DELETE with the whole result when it carries no body', async () => {
      const { api, client } = await loggedInApiWithFakeClient()
      const result = { status: 200, data: undefined }
      client.reply('delete', result)

      await expect(api.del('rooms.delete', {})).resolves.toBe(result)
    })

    it('answers a DELETE with the body when it carries one', async () => {
      const { api, client } = await loggedInApiWithFakeClient()
      client.reply('delete', { status: 200, data: { success: true } })

      await expect(api.del('rooms.delete', {})).resolves.toEqual({ success: true })
    })
  })

  describe('success', () => {
    let api: Api

    beforeEach(() => {
      api = apiWithFakeClient(new FakeClient())
    })

    it('accepts a 2xx and a 3xx status', () => {
      expect(api.success({ status: 200 })).toBe(true)
      expect(api.success({ status: 302 })).toBe(true)
    })

    it('refuses a 4xx and a 5xx status', () => {
      expect(api.success({ status: 400 })).toBe(false)
      expect(api.success({ status: 503 })).toBe(false)
    })

    it('accepts a result with no status at all', () => {
      expect(api.success({})).toBe(true)
    })
  })

  describe('logger', () => {
    it('logs to the logger it was handed', async () => {
      const logger = createSilentLogger()
      const { api } = await loggedInApiWithFakeClient((client) => new Api({ client, logger }))

      await api.get('me', {})

      expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('[API] GET me'))
    })

    it('logs the failure to the logger it was handed', async () => {
      const logger = createSilentLogger()
      const { api, client } = await loggedInApiWithFakeClient((client) => new Api({ client, logger }))
      client.reply('get', { status: 400, data: {} })

      await expect(api.get('me', {})).rejects.toBeDefined()

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('[API] GET error(me)'))
    })

    it('falls back to the module logger when handed none', () => {
      expect(apiWithFakeClient(new FakeClient()).logger).toBe(moduleLogger)
    })
  })
})
