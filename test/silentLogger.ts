import { ILogger } from '../interfaces'

/**
 * The SDK logs freely on paths the specs drive. This keeps the reporter readable
 * and, being jest mocks, lets a spec assert on what was logged when that is the
 * behaviour under test.
 */
export const silentLogger: ILogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warning: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}
