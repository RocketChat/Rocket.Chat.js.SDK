export const trackResolution = <T>(promise: Promise<T>): { value: T | undefined } => {
  const tracker: { value: T | undefined } = { value: undefined }
  promise.then((value) => { tracker.value = value })
  return tracker
}
