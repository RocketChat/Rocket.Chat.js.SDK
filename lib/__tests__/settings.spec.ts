import * as settings from '../settings'

/**
 * The module used to export eleven bindings derived from `process.env` at import
 * time, of which the SDK and the consuming app only ever read `customHeaders`.
 * These specs pin what is left: one mutable binding, and no environment read —
 * the second matters because `process.env` in the consuming app is a build-time
 * shim, not a real environment.
 */
describe('the shared settings', () => {
  it('exports nothing but the custom headers', () => {
    expect(Object.keys(settings)).toEqual(['customHeaders'])
  })

  it('starts with no custom headers', () => {
    expect(settings.customHeaders).toEqual({})
  })

  it('takes no value from the environment', async () => {
    jest.replaceProperty(process, 'env', {
      ...process.env,
      ROCKETCHAT_URL: 'https://from-the-environment.example',
      ROCKETCHAT_USER: 'from-the-environment',
      ROOM_CACHE_SIZE: '99'
    })

    await jest.isolateModulesAsync(async () => {
      const freshSettings = await import('../settings')

      expect(Object.keys(freshSettings)).toEqual(['customHeaders'])
      expect(freshSettings.customHeaders).toEqual({})
    })
  })
})
