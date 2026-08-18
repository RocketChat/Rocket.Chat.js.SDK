import * as settings from '../../settings'
import Api, { IClient } from '../api'
import { loggedInApiWithStubbedFetch } from '../../../test/apiFixtures'
import { answerFetchWith, answerFetchWithUnparsableBody, installFreshFetchMock, lastFetchCall } from '../../../test/stubbedFetch'

describe('api client', () => {
  let api: Api
  let restClient: IClient

  beforeEach(installFreshFetchMock)

  beforeEach(async () => {
    ({ api, restClient } = await loggedInApiWithStubbedFetch('http://localhost:3000'))
  })

  describe('request url', () => {
    it('addresses the host, api version and endpoint', async () => {
      const { api: apiOnAnotherHost } = await loggedInApiWithStubbedFetch('https://chat.example.com')

      await apiOnAnotherHost.get('me', {})

      expect(global.fetch).toHaveBeenCalledWith(
        'https://chat.example.com/api/v1/me?',
        expect.objectContaining({ method: 'GET' })
      )
    })

    it('addresses localhost when the caller named no host', async () => {
      const { api: apiOnDefaultHost } = await loggedInApiWithStubbedFetch()

      await apiOnDefaultHost.get('me', {})

      expect(lastFetchCall().url).toBe('http://localhost:3000/api/v1/me?')
    })

    it('addresses the api version the caller asked for', async () => {
      await api.get('rooms.info', {}, true, undefined, {}, 'v2')

      expect(lastFetchCall().url).toBe('http://localhost:3000/api/v2/rooms.info?')
    })

    it('addresses the endpoint on a put', async () => {
      await api.put('chat.update', { msg: 'edited' })

      expect(lastFetchCall().url).toBe('http://localhost:3000/api/v1/chat.update')
    })

    it('addresses the endpoint on a delete', async () => {
      await api.del('rooms.delete', { roomId: 'r' })

      expect(lastFetchCall().url).toBe('http://localhost:3000/api/v1/rooms.delete')
    })
  })

  describe('query params', () => {
    it('encodes an array as repeated bracketed keys', async () => {
      await api.get('rooms.info', { roomIds: ['one', 'two'] })

      expect(lastFetchCall().url).toContain('roomIds[]=one&roomIds[]=two')
    })

    it('encodes an object as json', async () => {
      await api.get('users.list', { query: { status: 'online' } })

      expect(lastFetchCall().url).toContain(`query=${encodeURIComponent('{"status":"online"}')}`)
    })
  })

  describe('headers', () => {
    it('sends the auth headers the login installed', async () => {
      await api.get('me', {})

      expect(lastFetchCall().init.headers).toEqual({
        'Content-Type': 'application/json',
        'X-Auth-Token': 'fake-token',
        'X-User-Id': 'fake-user-id'
      })
    })

    it('sends the custom headers the consumer set on the settings', async () => {
      jest.replaceProperty(settings, 'customHeaders', { 'X-Custom': 'yes' })
      await api.get('me', {})

      expect(lastFetchCall().init.headers).toMatchObject({ 'X-Custom': 'yes' })
    })

    it('sends the auth headers and the custom headers together', async () => {
      jest.replaceProperty(settings, 'customHeaders', { 'X-Custom': 'yes' })
      await api.get('me', {})

      expect(lastFetchCall().init.headers).toEqual({
        'Content-Type': 'application/json',
        'X-Custom': 'yes',
        'X-Auth-Token': 'fake-token',
        'X-User-Id': 'fake-user-id'
      })
    })

    it('drops the auth headers on a logout and keeps resolving the custom ones', async () => {
      jest.replaceProperty(settings, 'customHeaders', { 'X-Custom': 'first' })
      await api.logout()
      await api.get('settings.public', {}, false)

      expect(lastFetchCall().init.headers).toEqual({
        'Content-Type': 'application/json',
        'X-Custom': 'first'
      })

      jest.replaceProperty(settings, 'customHeaders', { 'X-Custom': 'second' })
      await api.get('settings.public', {}, false)

      expect(lastFetchCall().init.headers).toMatchObject({ 'X-Custom': 'second' })
    })

    it('sends only the headers the caller passed as options', async () => {
      await api.get('me', {}, true, undefined, { customHeaders: { 'X-Only': 'this' } })

      expect(lastFetchCall().init.headers).toEqual({ 'X-Only': 'this' })
    })
  })

  describe('body', () => {
    it('sends a json body on a post', async () => {
      await api.post('chat.postMessage', { msg: 'hello' })

      expect(lastFetchCall().init.body).toBe('{"msg":"hello"}')
    })

    it('sends a form body untouched on a post', async () => {
      const form = new FormData()

      await api.post('rooms.upload', form)

      expect(lastFetchCall().init.body).toBe(form)
    })

    it('sends a json body on a put', async () => {
      await api.put('chat.update', { msg: 'edited' })

      expect(lastFetchCall().init).toMatchObject({ method: 'PUT', body: '{"msg":"edited"}' })
    })

    it('sends a json body on a delete', async () => {
      await api.del('rooms.delete', { roomId: 'r' })

      expect(lastFetchCall().init).toMatchObject({ method: 'DELETE', body: '{"roomId":"r"}' })
    })
  })

  describe('result', () => {
    it('answers the parsed body under the http status', async () => {
      answerFetchWith({ success: true })

      await expect(restClient.get('me', {}, {})).resolves.toEqual({
        status: 200,
        data: { success: true }
      })
      await expect(api.get('me', {})).resolves.toEqual({ success: true })
    })

    it('rejects a body that is not json', async () => {
      answerFetchWithUnparsableBody()

      await expect(api.get('me', {})).rejects.toThrow('Unexpected end of JSON input')
    })
  })
})
