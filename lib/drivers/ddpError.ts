import { IDDPError } from '../../interfaces'

/**
 * An Error carrying a DDP error, so a caller can tell a failure the server sent
 * from one the SDK originated itself. The prototype is restored by hand because
 * a consuming app that downlevels classes otherwise breaks `instanceof`.
 */
export class DDPError extends Error {
  constructor (message: string) {
    super(message)
    Object.setPrototypeOf(this, DDPError.prototype)
  }
}

/**
 * Turn a DDP error into a DDPError, so callers reading `err.message` see the
 * reason. Its own fields are copied across, so anything branching on
 * `err.error` or `err.errorType` keeps working — except `message`, `name` and
 * `stack`, which stay the Error's own, so a DDP error carrying both `reason`
 * and `message` cannot overwrite the reason.
 */
export const toError = (ddpError: IDDPError | string | null): DDPError => {
  if (ddpError === null || typeof ddpError !== 'object') return new DDPError(String(ddpError))
  const error = new DDPError(ddpError.reason || ddpError.message || JSON.stringify(ddpError))
  for (const key of Object.keys(ddpError)) {
    if (key === 'message' || key === 'name' || key === 'stack') continue
    (error as any)[key] = ddpError[key]
  }
  return error
}
