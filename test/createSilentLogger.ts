import { ILogger } from '../interfaces'

export const createSilentLogger = (): ILogger => ({
  debug: jest.fn(),
  info: jest.fn(),
  warning: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
})
