/**
 * @module BoundedWait
 * One wait that ends exactly once — on the first settle, on its deadline, or on
 * a cancel — releasing whatever it attached before the promise settles.
 */
export class BoundedWait<T> {
  readonly promise: Promise<T>
  private settlePromise!: (value: T) => void
  private failPromise!: (err: any) => void
  private releases: Array<() => void> = []
  private deadline?: NodeJS.Timer | number
  private settled = false

  constructor (deadlineMs?: number, onDeadline?: (wait: BoundedWait<T>) => void) {
    this.promise = new Promise<T>((settle, fail) => {
      this.settlePromise = settle
      this.failPromise = fail
    })

    if (deadlineMs !== undefined && onDeadline) {
      this.deadline = setTimeout(() => onDeadline(this), deadlineMs)
    }
  }

  release = (release: () => void) => {
    this.releases.push(release)
  }

  resolve = (value: T) => {
    if (this.end()) this.settlePromise(value)
  }

  reject = (err: any) => {
    if (this.end()) this.failPromise(err)
  }

  /** End the wait, releasing it, and leave the promise to another settler. */
  cancel = () => {
    this.end()
  }

  private end = () => {
    if (this.settled) return false
    this.settled = true
    clearTimeout(this.deadline as any)
    this.releases.forEach((release) => release())
    return true
  }
}
