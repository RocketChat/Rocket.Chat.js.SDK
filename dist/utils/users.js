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
};
Object.defineProperty(exports, "__esModule", { value: true });
// Test script uses standard methods and env config to connect and log streams
const api = __importStar(require("../lib/api"));
const log_1 = require("../lib/log");
log_1.silence();
function users() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log(`

Demo of API user query helpers

ALL users \`api.users.all()\`:
${JSON.stringify(yield api.users.all(), null, '\t')}

ALL usernames \`api.users.allNames()\`:
${JSON.stringify(yield api.users.allNames(), null, '\t')}

ALL IDs \`api.users.allIDs()\`:
${JSON.stringify(yield api.users.allIDs(), null, '\t')}

ONLINE users \`api.users.online()\`:
${JSON.stringify(yield api.users.online(), null, '\t')}

ONLINE usernames \`api.users.onlineNames()\`:
${JSON.stringify(yield api.users.onlineNames(), null, '\t')}

ONLINE IDs \`api.users.onlineIds()\`:
${JSON.stringify(yield api.users.onlineIds(), null, '\t')}

  `);
    });
}
users().catch((e) => console.error(e));
//# sourceMappingURL=users.js.map