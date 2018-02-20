// @ts-ignore // Asteroid is not typed
import { createClass } from 'asteroid'
import { EventEmitter } from 'events'
import ws from 'ws'
const Asteroid = createClass()

/**
 * Main interface for interacting with Rocket.Chat
 * @param asteroid  An Asteroid instance to connect to Meteor server
 */
export class Driver extends EventEmitter {
  private asteroid: any /** @TODO update with Asteroid type (submit to tsd) */

  /**
   * Creates a new driver instance with given options or defaults
   * @param host  Rocket.Chat instance Host URL:PORT (without protocol)
   */
  // @ts-ignore // host is unused (doesn't notice use in template literal)
  constructor (public host = 'localhost:3000') {
    super()
    this.asteroid = new Asteroid({
      endpoint: `ws://${host}/websocket`,
      SocketConstructor: ws
    })
    this.asteroid.on('connected', () => this.emit('connected'))
    this.asteroid.on('reconnected', () => this.emit('reconnected'))
  }
}
