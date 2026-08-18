const fetchMock = () => global.fetch as unknown as jest.Mock

export const installFreshFetchMock = () => Object.defineProperty(global, 'fetch', {
  value: jest.fn(),
  writable: true,
  configurable: true
})

export const answerFetchWith = (body: any) =>
  fetchMock().mockResolvedValue({ status: 200, json: async () => body })

export const answerFetchWithUnparsableBody = () =>
  fetchMock().mockResolvedValue({
    status: 204,
    json: async () => { throw new Error('Unexpected end of JSON input') }
  })

export const lastFetchCall = (): { url: string, init: any } => {
  const calls = fetchMock().mock.calls
  const [url, init] = calls[calls.length - 1]
  return { url, init }
}
