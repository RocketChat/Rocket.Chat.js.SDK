"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
}
Object.defineProperty(exports, "__esModule", { value: true });
// Test script uses standard methods and env config to connect and log streams
const driver = __importStar(require("../lib/driver"));
const config_1 = require("./config");
// Start subscription to log message stream (used for e2e test)
function start() {
    const credentials = { username: config_1.botUser.username, password: config_1.botUser.password };
    driver.connect()
        .then(() => driver.login(credentials))
        .then(() => driver.joinRooms(config_1.botRooms))
        .then(() => driver.subscribeToMessages())
        .then(() => driver.reactToMessages((err, msg, msgOpts) => {
        if (err)
            throw err;
        console.log('[message]', JSON.stringify(msg), JSON.stringify(msgOpts));
    }))
        .catch(() => console.error('START FAILED')); // caught within each
}
start();
//# sourceMappingURL=start.js.map