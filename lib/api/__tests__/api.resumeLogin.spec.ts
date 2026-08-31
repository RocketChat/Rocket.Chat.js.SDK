import { anonymousApiWithFakeClient, loggedInApiWithFakeClient } from '../../../test/apiFixtures'

describe('Api resumeLogin', () => {
  it('installs the auth headers from a stored token with no login held', () => {
    const { api, restClient } = anonymousApiWithFakeClient()

    api.resumeLogin({ userId: 'stored-user-id', authToken: 'stored-token' })

    expect(restClient.headers).toMatchObject({
      'X-Auth-Token': 'stored-token',
      'X-User-Id': 'stored-user-id'
    })
    expect(api.userId).toBe('stored-user-id')
    expect(api.loggedIn()).toBe(true)
    expect(api.currentLogin).toMatchObject({ username: null, result: null })
  })

  it('keeps the held username when the same user resumes under a new token', async () => {
    const { api } = await loggedInApiWithFakeClient()

    api.resumeLogin({ userId: 'fake-user-id', authToken: 'renewed-token' })

    expect(api.currentLogin).toMatchObject({
      username: 'fake-username',
      userId: 'fake-user-id',
      authToken: 'renewed-token'
    })
  })

  it('answers a null username when a different user resumes', async () => {
    const { api } = await loggedInApiWithFakeClient()

    api.resumeLogin({ userId: 'other-user-id', authToken: 'other-token' })

    expect(api.currentLogin).toMatchObject({
      username: null,
      userId: 'other-user-id',
      authToken: 'other-token'
    })
  })

  it('leaves the held login untouched when the user id and token already match', async () => {
    const { api } = await loggedInApiWithFakeClient()
    const held = api.currentLogin

    api.resumeLogin({ userId: 'fake-user-id', authToken: 'fake-token' })

    expect(api.currentLogin).toBe(held)
  })
})
