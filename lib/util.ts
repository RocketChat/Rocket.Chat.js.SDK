/** Read a message off a caught value, which `throw` allows to be anything */
export function errorMessage (err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** Convert a http/s protocol address to a websocket URL */
export function hostToWS (host: string, ssl = false) {
  host = host.replace(/^(https?:\/\/)?/, '')
  return `ws${ssl ? 's' : ''}://${host}`
}
