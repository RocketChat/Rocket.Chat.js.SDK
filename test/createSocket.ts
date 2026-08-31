import { Socket } from '../lib/drivers/socket'
import { ILogger, ISocketOptions } from '../interfaces'
import { createSilentLogger } from './createSilentLogger'

export const createSocket = (options: ISocketOptions & { logger?: ILogger } = {}) =>
  new Socket({ host: 'localhost:3000', logger: createSilentLogger(), ...options })
