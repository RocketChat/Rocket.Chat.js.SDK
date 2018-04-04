"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
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
    return __awaiter(this, void 0, void 0, function* () {
        yield driver.connect();
        yield driver.login({ username: config_1.botUser.username, password: config_1.botUser.password });
        yield driver.joinRooms(config_1.botRooms);
        yield driver.subscribeToMessages();
        driver.respondToMessages((err, msg, msgOpts) => {
            if (err)
                throw err;
            console.log('[respond]', JSON.stringify(msg), JSON.stringify(msgOpts));
        });
    });
}
start().catch((e) => console.error(e));
//# sourceMappingURL=start.js.map