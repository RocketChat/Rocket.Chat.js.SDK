const fakeFetch = () => global.fetch as unknown as jest.Mock

export const installFakeFetch = () => Object.defineProperty(global, 'fetch', {
  value: jest.fn(),
  writable: true,
  configurable: true
})

export const answerFetchWith = (body: any) =>
  fakeFetch().mockResolvedValue({ status: 200, json: async () => body })

export const answerFetchWithStatus = (status: number, body: any) =>
  fakeFetch().mockResolvedValue({ status, json: async () => body })

export const answerFetchWithUnparsableBody = () =>
  fakeFetch().mockResolvedValue({
    status: 204,
    json: async () => { throw new Error('Unexpected end of JSON input') }
  })

export const lastFetchCall = (): { url: string, init: any } => {
  const calls = fakeFetch().mock.calls
  const [url, init] = calls[calls.length - 1]
  return { url, init }
}
