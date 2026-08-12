import { ILogger } from '../../interfaces'
import * as log from '../log'

const levels: (keyof ILogger)[] = ['debug', 'info', 'warning', 'warn', 'error']

describe('the fallback logger', () => {
  afterEach(() => log.silence())

  it('is what an SDK object falls back to before anything replaces it', () => {
    expect(log.logger).toBe(log.silentLogger)
  })

  it('answers every level the ILogger contract names, including the legacy warn', () => {
    for (const level of levels) {
      expect(log.silentLogger[level]('anything')).toBeUndefined()
    }
  })

  it('writes nothing', () => {
    const consoleWrites = (['log', 'debug', 'info', 'warn', 'error'] as const).map((write) =>
      jest.spyOn(console, write).mockImplementation(() => undefined)
    )

    for (const level of levels) log.silentLogger[level]('anything')

    for (const consoleWrite of consoleWrites) {
      expect(consoleWrite).not.toHaveBeenCalled()
      consoleWrite.mockRestore()
    }
  })
})

describe('replacing the fallback logger', () => {
  afterEach(() => log.silence())

  it('is seen by everything that reads the logger afterwards', () => {
    const appLogger = { ...log.silentLogger, error: jest.fn() }

    log.replaceLog(appLogger)

    expect(log.logger).toBe(appLogger)
    log.logger.error('reached')
    expect(appLogger.error).toHaveBeenCalledWith('reached')
  })

  it('is undone by silence, back to the same fallback the SDK started with', () => {
    log.replaceLog({ ...log.silentLogger, error: jest.fn() })

    log.silence()

    expect(log.logger).toBe(log.silentLogger)
  })
})
