import Api from '../api'
import { logger as moduleLogger } from '../../log'
import { FakeClient } from '../../../test/fakeClient'
import { createSilentLogger } from '../../../test/createSilentLogger'

describe('Api options', () => {
  it('keeps the logger it was handed', () => {
    const logger = createSilentLogger()

    const api = new Api({ client: new FakeClient(), logger })

    expect(api.logger).toBe(logger)
  })

  it('falls back to the module logger when handed none', () => {
    const api = new Api({ client: new FakeClient() })

    expect(api.logger).toBe(moduleLogger)
  })

  it('rejects an unrecognized option, which only typecheck can fail on', () => {
    // @ts-expect-error
    const api = new Api({ client: new FakeClient(), loggr: createSilentLogger() })

    expect(api).toBeInstanceOf(Api)
  })
})
