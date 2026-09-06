import { DDPError, toError } from '../ddpError'

describe('toError', () => {
  describe('the message', () => {
    it('is the reason', () => {
      const error = toError({ error: 403, reason: 'User not found', errorType: 'Meteor.Error' })

      expect(error).toBeInstanceOf(Error)
      expect(error.message).toBe('User not found')
    })

    it('falls back to `message` when there is no reason', () => {
      expect(toError({ error: 500, message: 'Internal server error' }).message)
        .toBe('Internal server error')
    })

    it('is the reason even when the DDP error carries a message of its own', () => {
      const error = toError({ reason: 'User not found', message: '[403] User not found' })

      expect(error.message).toBe('User not found')
    })

    it('falls back to the serialized DDP error when it names neither reason nor message', () => {
      expect(toError({ error: 500 }).message).toBe('{"error":500}')
    })
  })

  describe('the copied fields', () => {
    it('keeps the fields a caller might branch on', () => {
      const error = toError({ error: 403, reason: 'User not found', errorType: 'Meteor.Error' })

      expect(error).toMatchObject({ error: 403, errorType: 'Meteor.Error' })
    })

    it('leaves `name` and `stack` as the Error\'s own', () => {
      const error = toError({ reason: 'nope', name: 'ServerError', stack: 'not a stack' })

      expect(error.name).toBe('Error')
      expect(error.stack).not.toBe('not a stack')
      expect(error.stack).toContain('nope')
    })
  })

  describe('what it produces', () => {
    it('is a DDPError, whatever shape the DDP error arrived in', () => {
      expect(toError({ error: 403, reason: 'User not found' })).toBeInstanceOf(DDPError)
      expect(toError('you must be logged in')).toBeInstanceOf(DDPError)
      expect(toError(null)).toBeInstanceOf(DDPError)
    })

    it('is still an Error', () => {
      expect(toError('you must be logged in')).toBeInstanceOf(Error)
    })
  })

  describe('a DDP error that is not an object', () => {
    it('uses a bare string as the message', () => {
      expect(toError('you must be logged in').message).toBe('you must be logged in')
    })

    it('does not throw on null', () => {
      expect(toError(null).message).toBe('null')
    })
  })
})
