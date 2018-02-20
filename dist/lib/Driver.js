"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
}
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-ignore // Asteroid is not typed
const asteroid_1 = require("asteroid");
const events_1 = require("events");
const ws_1 = __importDefault(require("ws"));
const Asteroid = asteroid_1.createClass();
/**
 * Main interface for interacting with Rocket.Chat
 * @param asteroid  An Asteroid instance to connect to Meteor server
 */
class Driver extends events_1.EventEmitter {
    /**
     * Creates a new driver instance with given options or defaults
     * @param host  Rocket.Chat instance Host URL:PORT (without protocol)
     */
    // @ts-ignore // host is unused (doesn't notice use in template literal)
    constructor(host = 'localhost:3000') {
        super();
        this.host = host;
        this.asteroid = new Asteroid({
            endpoint: `ws://${host}/websocket`,
            SocketConstructor: ws_1.default
        });
        this.asteroid.on('connected', () => this.emit('connected'));
        this.asteroid.on('reconnected', () => this.emit('reconnected'));
    }
}
exports.Driver = Driver;
//# sourceMappingURL=Driver.js.map