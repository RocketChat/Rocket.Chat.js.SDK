import { Message } from '../message'

/**
 * The constructor's second argument used to be `any`, so nothing described the
 * fields it accepts. These specs pin that surface: the room a Message is
 * addressed to, and the integration that traces an automated send.
 */
describe('Message', () => {
  it('carries text content as the message body', () => {
    expect({ ...new Message('hello', { rid: 'room' }) }).toEqual({
      msg: 'hello',
      rid: 'room'
    })
  })

  it('carries a preformed message through', () => {
    expect({ ...new Message({ msg: 'hello', emoji: ':wave:' }, { rid: 'room' }) }).toEqual({
      msg: 'hello',
      emoji: ':wave:',
      rid: 'room'
    })
  })

  it('lets the fields win over the preformed message', () => {
    expect({ ...new Message({ msg: 'hello', rid: 'from-the-content' }, { rid: 'from-the-fields' }) }).toEqual({
      msg: 'hello',
      rid: 'from-the-fields'
    })
  })

  it('traces an automated send by its integration', () => {
    expect({ ...new Message('hello', { rid: 'room', integrationId: 'js.SDK' }) }).toEqual({
      msg: 'hello',
      rid: 'room',
      bot: { i: 'js.SDK' }
    })
  })

  it('is not a bot send without an integration', () => {
    expect(new Message('hello', { rid: 'room' })).not.toHaveProperty('bot')
  })
})
