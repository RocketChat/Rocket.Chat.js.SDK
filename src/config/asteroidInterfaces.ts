import { EventEmitter } from 'events'

/**
 * Patch in mock Asteroid type
 * @todo Update with typing from definately typed (when available)
 */
export interface IAsteroid extends EventEmitter {
  ddp: { on: (event: string, func: (doc: any) => void) => void }
  connect: () => void,
  disconnect: () => void,
  call: (method: string, params: any) => any
  apply: (method: string, params: any[]) => any
  subscribe: (name: string, params: any) => any
  subscriptions: ISubscription[],
  unsubscribe: (id: string) => void,
  createUser: (options: IUserOptions) => Promise<string>,
  loginWithPassword: (options: IUserOptions) => Promise<string>,
  login: (params: any) => Promise<string>,
  logout: () => void
}

/**
 * Patch in Asteroid subscription type
 * @todo Update with typing from definately typed (when available)
 */
export interface ISubscription extends EventEmitter {
  id: string
}

/**
 * Patch in Asteroid user options type
 * @todo Update with typing from definately typed (when available)
 */
export interface IUserOptions {
  username?: string,
  email?: string,
  password: string
}
