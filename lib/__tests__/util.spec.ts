import { hostToWS } from '../util'

describe('hostToWS', () => {
  it('gives a bare host a websocket scheme', () => {
    expect(hostToWS('localhost:3000')).toBe('ws://localhost:3000')
  })

  it('gives a secure websocket scheme when asked for one', () => {
    expect(hostToWS('localhost:3000', true)).toBe('wss://localhost:3000')
  })

  it('replaces an http scheme', () => {
    expect(hostToWS('http://localhost:3000')).toBe('ws://localhost:3000')
  })

  it('replaces an https scheme', () => {
    expect(hostToWS('https://open.rocket.chat', true)).toBe('wss://open.rocket.chat')
  })

  it('takes the scheme from the flag rather than from the host', () => {
    // An https host with the flag off still downgrades. Callers pass both halves
    // separately, so the host alone never decides.
    expect(hostToWS('https://open.rocket.chat')).toBe('ws://open.rocket.chat')
    expect(hostToWS('http://localhost:3000', true)).toBe('wss://localhost:3000')
  })

  it('leaves a path on the host untouched', () => {
    expect(hostToWS('https://open.rocket.chat/websocket')).toBe('ws://open.rocket.chat/websocket')
  })
})
