import { IDDPError } from '../../interfaces'

/**
 * Turn a DDP error into an Error, so callers reading `err.message` see the
 * reason. Its own fields are copied across, so anything branching on
 * `err.error` or `err.errorType` keeps working — except `message`, `name` and
 * `stack`, which stay the Error's own, so a DDP error carrying both `reason`
 * and `message` cannot overwrite the reason.
 */
export const toError = (ddpError: IDDPError | string | null): Error => {
  if (ddpError === null || typeof ddpError !== 'object') return new Error(String(ddpError))
  const error = new Error(ddpError.reason || ddpError.message || JSON.stringify(ddpError))
  for (const key of Object.keys(ddpError)) {
    if (key === 'message' || key === 'name' || key === 'stack') continue
    (error as any)[key] = ddpError[key]
  }
  return error
}
