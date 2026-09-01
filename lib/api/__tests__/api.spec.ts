import Api from '../api'
import { createSilentLogger } from '../../../test/createSilentLogger'
import {
  anonymousApiWithFakeClient,
  loggedInApiWithFakeClient
} from '../../../test/apiFixtures'
import { loginResponse } from '../../../test/loginResponse'

const emptySuccess = () => ({ status: 200, data: {} })

describe('api', () => {
  describe('login', () => {
    it('installs the auth headers the following requests need', async () => {
      const { restClient } = await loggedInApiWithFakeClient()

      expect(restClient.headers).toEqual({
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

    it('keeps the answered login data, user included, as the current result', async () => {
      const { api } = await loggedInApiWithFakeClient()
      const result = api.currentLogin!.result!

      expect(result).toEqual({
        userId: 'fake-user-id',
        authToken: 'fake-token',
        me: { _id: 'fake-user-id', username: 'fake-username' }
      })
    })

    it('keeps a null username when the answered login carries no username', async () => {
      const { api, restClient } = anonymousApiWithFakeClient()
      restClient.enqueueReply({
        status: 200,
        data: { data: { userId: 'fake-user-id', authToken: 'fake-token', me: { _id: 'fake-user-id' } } }
      })

      await api.loginWithRest({ username: 'user', password: 'pass' })

      expect(api.username).toBeNull()
      expect(api.userId).toBe('fake-user-id')
    })

    it('posts the configured login fields alongside the credentials', async () => {
      const { api, restClient } = anonymousApiWithFakeClient()
      restClient.enqueueReply(loginResponse())

      await api.loginWithRest({ username: 'user', password: 'pass' }, { code: '2fa-code' })

      expect(restClient.lastRequest().data).toEqual({
        username: 'user',
        password: 'pass',
        code: '2fa-code'
      })
    })

    it('sends a resume token as its own login method', async () => {
      const { api, restClient } = anonymousApiWithFakeClient()
      restClient.enqueueReply(loginResponse())

      await api.loginWithRest({ resume: 'fake-token' })

      expect(restClient.requests[0].data).toEqual({ resume: 'fake-token' })
      expect(api.userId).toBe('fake-user-id')
    })
  })

  describe('logout', () => {
    it('answers nothing without asking the server when there is no login', async () => {
      const { api, restClient } = anonymousApiWithFakeClient()

      await expect(api.logout()).resolves.toBeNull()
      expect(restClient.requests).toHaveLength(0)
    })

    it('clears the identity once the server has answered', async () => {
      const { api, restClient } = await loggedInApiWithFakeClient()
      restClient.enqueueReply(emptySuccess())

      await api.logout()

      expect(api.userId).toBe('')
      expect(api.username).toBeNull()
      expect(restClient.lastRequest().endpoint).toBe('logout')
    })

    it('answers the body the server sent', async () => {
      const { api, restClient } = await loggedInApiWithFakeClient()
      restClient.enqueueReply({ status: 200, data: { success: true } })

      await expect(api.logout()).resolves.toEqual({ success: true })
    })

    it('removes the auth headers and leaves the others in place', async () => {
      const { api, restClient } = await loggedInApiWithFakeClient()
      restClient.headers = { ...restClient.headers, 'X-Custom-Header': 'kept' }
      restClient.enqueueReply(emptySuccess())

      await api.logout()

      expect(restClient.headers).toEqual({ 'X-Custom-Header': 'kept' })
    })
  })

  describe('request', () => {
    it('routes each method to its own restClient call', async () => {
      const { api, restClient } = await loggedInApiWithFakeClient()
      restClient.enqueueReply(emptySuccess(), emptySuccess(), emptySuccess(), emptySuccess())

      await api.get('chat.getMessage', {})
      await api.post('chat.postMessage', {})
      await api.put('chat.update', {})
      await api.del('chat.delete', {})

      expect(restClient.requests.map((request) => request.method)).toEqual([
        'GET',
        'POST',
        'PUT',
        'DELETE'
      ])
    })

    it('passes the body the caller asked for through to the restClient', async () => {
      const { api, restClient } = await loggedInApiWithFakeClient()
      restClient.enqueueReply(emptySuccess(), emptySuccess())

      await api.post('chat.postMessage', { msg: 'hello' })
      expect(restClient.lastRequest().data).toEqual({ msg: 'hello' })

      await api.put('chat.update', { msg: 'edited' })
      expect(restClient.lastRequest().data).toEqual({ msg: 'edited' })
    })

    it('passes an explicit api version through to the restClient on every method', async () => {
      const { api, restClient } = await loggedInApiWithFakeClient()
      restClient.enqueueReply(emptySuccess(), emptySuccess(), emptySuccess(), emptySuccess())

      await api.get('chat.getMessage', {}, undefined, {}, 'v2')
      await api.post('chat.postMessage', {}, undefined, {}, 'v2')
      await api.put('chat.update', {}, undefined, {}, 'v2')
      await api.del('chat.delete', {}, undefined, {}, 'v2')

      expect(restClient.requests.map((request) => request.apiVersion)).toEqual([
        'v2', 'v2', 'v2', 'v2'
      ])
    })

    it('carries the abort signal on every request', async () => {
      const { api, restClient } = await loggedInApiWithFakeClient()
      restClient.enqueueReply(emptySuccess(), emptySuccess(), emptySuccess(), emptySuccess())

      await api.get('chat.getMessage', {})
      await api.post('chat.postMessage', {})
      await api.put('chat.update', {})
      await api.del('chat.delete', {})

      for (const request of restClient.requests) {
        expect(request.options.signal).toBe(api.controller.signal)
      }
      expect(restClient.requests).toHaveLength(4)
    })

    it('answers with the body of the result', async () => {
      const { api, restClient } = await loggedInApiWithFakeClient()
      restClient.enqueueReply({ status: 200, data: { success: true } })

      await expect(api.get('me', {})).resolves.toEqual({ success: true })
    })

    it('throws the result itself when the status is a failure', async () => {
      const { api, restClient } = await loggedInApiWithFakeClient()
      const failed = { status: 400, data: { error: 'nope' } }
      restClient.enqueueReply(failed)

      await expect(api.get('me', {})).rejects.toBe(failed)
    })

    it('accepts a failure status the caller asked to ignore', async () => {
      const { api, restClient } = await loggedInApiWithFakeClient()
      restClient.enqueueReply({ status: 400, data: { error: 'nope' } })

      await expect(api.get('me', {}, /400/)).resolves.toEqual({ error: 'nope' })
    })

    it('throws when the restClient answers nothing at all', async () => {
      const { api, restClient } = await loggedInApiWithFakeClient()
      restClient.enqueueReply(undefined)

      await expect(api.get('me', {})).rejects.toThrow('API GET me result undefined')
    })

    it('answers a DELETE with the whole result when it carries no body', async () => {
      const { api, restClient } = await loggedInApiWithFakeClient()
      const result = { status: 200, data: undefined }
      restClient.enqueueReply(result)

      await expect(api.del('rooms.delete', {})).resolves.toBe(result)
    })

    it('answers a DELETE with the body when it carries one', async () => {
      const { api, restClient } = await loggedInApiWithFakeClient()
      restClient.enqueueReply({ status: 200, data: { success: true } })

      await expect(api.del('rooms.delete', {})).resolves.toEqual({ success: true })
    })
  })

  describe('success', () => {
    let api: Api

    beforeEach(() => {
      api = anonymousApiWithFakeClient().api
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
      const { api, restClient } = await loggedInApiWithFakeClient(logger)
      restClient.enqueueReply(emptySuccess())

      await api.get('me', {})

      expect(logger.debug).toHaveBeenCalledWith('[API] GET me: {}')
    })

    it('logs the failure to the logger it was handed', async () => {
      const logger = createSilentLogger()
      const { api, restClient } = await loggedInApiWithFakeClient(logger)
      restClient.enqueueReply({ status: 400, data: {} })

      await expect(api.get('me', {})).rejects.toBeDefined()

      expect(logger.error).toHaveBeenCalledWith('[API] GET error(me): {"status":400,"data":{}}')
    })

    it('does not serialize request data for the default silent logger', async () => {
      const { api, restClient } = anonymousApiWithFakeClient()
      const toJSON = jest.fn(() => ({}))
      restClient.enqueueReply(emptySuccess())

      await api.get('me', { toJSON })

      expect(toJSON).not.toHaveBeenCalled()
    })
  })
})
