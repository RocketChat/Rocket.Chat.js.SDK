"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
}
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
}
Object.defineProperty(exports, "__esModule", { value: true });
const asteroid_1 = require("asteroid");
const events_1 = require("events");
const ws_1 = __importDefault(require("ws"));
const methodCache = __importStar(require("./methodCache"));
const Asteroid = asteroid_1.createClass();
exports.defaults = {
    host: 'localhost:3000',
    timeout: 20 * 1000 // 20 seconds
};
/**
 * Event Emitter for listening to connection
 * @example
 *  import { driver } from 'rocketchat-bot-driver'
 *  driver.connect()
 *  driver.events.on('connected', () => console.log('driver connected'))
 */
exports.events = new events_1.EventEmitter();
/**
 * Initialise asteroid instance with given options or defaults
 * @example <caption>Use with callback</caption>
 *  import { driver } from 'rocketchat-bot-driver'
 *  driver.connect({}, (err, asteroid) => {
 *    if (err) throw err
 *    else constole.log(asteroid)
 *  })
 * @example <caption>Using promise</caption>
 *  import { driver } from 'rocketchat-bot-driver'
 *  driver.connect()
 *    .then((asteroid) => {
 *      console.log(asteroid)
 *    })
 *    .catch((err) => {
 *      console.error(err)
 *    })
 */
function connect(options = {}, callback) {
    return new Promise((resolve, reject) => {
        options = Object.assign(exports.defaults, options);
        exports.asteroid = new Asteroid({
            endpoint: `ws://${options.host}/websocket`,
            SocketConstructor: ws_1.default
        });
        methodCache.use(exports.asteroid); // init instance for later caching method calls
        exports.asteroid.on('connected', () => exports.events.emit('connected'));
        exports.asteroid.on('reconnected', () => exports.events.emit('reconnected'));
        let cancelled = false;
        const rejectionTimeout = setTimeout(() => {
            cancelled = true;
            const err = new Error('Asteroid connection timeout');
            // if no callback available, reject the promise
            // else, return callback using "error-first-pattern"
            return callback ? callback(err, exports.asteroid) : reject(err);
        }, options.timeout);
        exports.asteroid.once('connected', () => {
            // cancel connection and don't resolve if already rejected
            if (cancelled)
                return exports.asteroid.disconnect();
            clearTimeout(rejectionTimeout);
            return (callback !== undefined) ? callback(null, exports.asteroid) : resolve(exports.asteroid);
        });
    });
}
exports.connect = connect;
//# sourceMappingURL=driver.js.map