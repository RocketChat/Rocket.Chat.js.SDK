import { Driver } from '../lib/drivers/driver'
import { ISocketOptions } from '../interfaces'
import { createSilentLogger } from './createSilentLogger'

export const createDriver = (options: ISocketOptions = {}) =>
  new Driver({ host: 'localhost:3000', logger: createSilentLogger(), ...options })
