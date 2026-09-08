import * as log from '../log'

describe('log', () => {
  describe('the internal logger', () => {
    it('forwards `warn` to `warning`', () => {
      const warning = jest.spyOn(log.logger, 'warning')

      log.logger.warn('deprecated', 1)

      expect(warning).toHaveBeenCalledWith('deprecated', 1)
    })
  })
})
