import Api from '../api'
import { FakeClient } from '../../../test/fakeClient'

describe('Api prepareMessage', () => {
  let api: Api

  beforeEach(() => {
    api = new Api({ client: new FakeClient() })
  })

  it('addresses a string message to the room under both id keys', () => {
    expect(api.prepareMessage('hello', 'room-1')).toEqual({
      msg: 'hello',
      rid: 'room-1',
      roomId: 'room-1'
    })
  })

  it('moves integrationId into bot rather than onto the message', () => {
    const message = api.prepareMessage('hello', 'room-1', { integrationId: 'bot-1' })

    expect(message.bot).toEqual({ i: 'bot-1' })
    expect(message).not.toHaveProperty('integrationId')
  })

  it('lets args override the room id it was addressed to', () => {
    expect(api.prepareMessage('hello', 'room-1', { rid: 'room-2', roomId: 'room-2' })).toEqual({
      msg: 'hello',
      rid: 'room-2',
      roomId: 'room-2'
    })
  })

  it('lets args override a rid the message already carried', () => {
    const message = api.prepareMessage({ msg: 'hello', rid: 'room-1' }, undefined, { rid: 'room-2' })

    expect(message.rid).toBe('room-2')
  })

  it('leaves bot unset when no integrationId is given', () => {
    expect(api.prepareMessage({ msg: 'hello' }, 'room-1').bot).toBeUndefined()
  })
})
