/** Convert a http/s protocol address to a websocket URL */
export function hostToWS (host: string, ssl = false) {
  host = host.replace(/^(https?:\/\/)?/, '')
  return `ws${ssl ? 's' : ''}://${host}`
}
