import { DDPError, toError } from '../ddpError'

/**
 * The seam where a DDP error — the error field of a failed DDP response, as the
 * server sent it — becomes an Error the SDK can raise. What `send` does with the
 * result is ddp.send.spec.ts; this file is only about the conversion.
 */
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
      // The copy below must not reach `message`: some server paths send both,
      // and `reason` is the one callers want to read.
      const error = toError({ reason: 'User not found', message: '[403] User not found' })

      expect(error.message).toBe('User not found')
    })

    it('falls back to the whole DDP error when it names no reason at all', () => {
      // Nothing readable to pick, so the message shows what actually arrived
      // rather than saying nothing.
      expect(toError({ error: 500 }).message).toBe('{"error":500}')
    })
  })

  describe('the copied fields', () => {
    it('keeps the fields a caller might branch on', () => {
      const error = toError({ error: 403, reason: 'User not found', errorType: 'Meteor.Error' })

      expect(error).toMatchObject({ error: 403, errorType: 'Meteor.Error' })
    })

    it('leaves `name` and `stack` as the Error\'s own', () => {
      // Copying these would leave an Error that lies about what it is and where
      // it came from.
      const error = toError({ reason: 'nope', name: 'ServerError', stack: 'not a stack' })

      expect(error.name).toBe('Error')
      expect(error.stack).not.toBe('not a stack')
      expect(error.stack).toContain('nope')
    })
  })

  describe('what it produces', () => {
    it('is a DDPError, whatever shape the DDP error arrived in', () => {
      // The only way a caller can tell a failure the server sent from one the
      // SDK made itself, so a bare string cannot be left as a plain Error.
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
      // A server may legally send a string rather than an object here.
      expect(toError('you must be logged in').message).toBe('you must be logged in')
    })

    it('does not throw on null', () => {
      expect(toError(null).message).toBe('null')
    })
  })
})
