import Api from '../api'
import { FakeClient } from '../../../test/fakeClient'
import { ILogger } from '../../../interfaces'

const fakeLogger = (): ILogger => ({
  debug: () => null,
  info: () => null,
  warn: () => null,
  warning: () => null,
  error: () => null
})

describe('Api options', () => {
  it('keeps the logger it was handed', () => {
    const logger = fakeLogger()

    const api = new Api({ client: new FakeClient(), logger })

    expect(api.logger).toBe(logger)
  })

  it('rejects an unrecognized option', () => {
    // @ts-expect-error unknown keys must not typecheck
    const api = new Api({ client: new FakeClient(), loggr: fakeLogger() })

    expect(api).toBeInstanceOf(Api)
  })
})
