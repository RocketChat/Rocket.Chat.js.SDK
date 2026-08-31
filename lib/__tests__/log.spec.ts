import { ILogger } from '../../interfaces'

import * as log from '../log'
import { replaceLog } from '../log'

describe('log', () => {
  const internalLogger = log.logger

  afterEach(() => replaceLog(internalLogger))

  describe('the internal logger', () => {
    it('forwards `warn` to `warning`', () => {
      const warning = jest.spyOn(internalLogger, 'warning')

      internalLogger.warn('deprecated', 1)

      expect(warning).toHaveBeenCalledWith('deprecated', 1)
    })
  })

  describe('replaceLog', () => {
    it('makes the exported logger the given one', () => {
      const externalLogger: ILogger = {
        debug: jest.fn(),
        info: jest.fn(),
        warning: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
      }

      replaceLog(externalLogger)

      expect(log.logger).toBe(externalLogger)
    })
  })
})
