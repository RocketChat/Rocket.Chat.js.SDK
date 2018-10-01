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
const api = __importStar(require("./lib/api"));
const log_1 = require("../lib/log");
const mock_1 = require("./lib/mock");
const settings = __importStar(require("./lib/settings"));
log_1.silence();
function getVisitorToken() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('\nPreparing visitor token for tests...');
        let token = settings.token;
        if (!token || token === '') {
            const { visitor } = yield api.livechat.grantVisitor(mock_1.mockVisitor);
            token = visitor && visitor.token;
        }
        return token;
    });
}
function getRoom(token) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('\nPreparing room for tests...');
        const { room } = yield api.livechat.room({ token });
        return room;
    });
}
function messages() {
    return __awaiter(this, void 0, void 0, function* () {
        const token = yield getVisitorToken();
        const room = yield getRoom(token);
        const rid = room && room._id;
        const newMessage = {
            token,
            rid,
            msg: 'sending livechat message..'
        };
        const editMessage = {
            token,
            rid,
            msg: 'editing livechat message..'
        };
        const result = yield api.livechat.sendMessage(newMessage);
        const _id = result && result.message && result.message._id;
        const roomCredential = { token, rid };
        const pageInfo = Object.assign({}, mock_1.mockVisitorNavigation, { rid });
        console.log(`

Demo of API livechat query helpers

Send Livechat Message \`api.livechat.sendMessage()\`:
${JSON.stringify(result, null, '\t')}

Edit Livechat Message \`api.livechat.editMessage()\`:
${JSON.stringify(yield api.livechat.editMessage(_id, editMessage), null, '\t')}

Load Livechat Messages \`api.livechat.loadMessages()\`:
${JSON.stringify(yield api.livechat.loadMessages(rid, { token }), null, '\t')}

Delete Livechat Message \`api.livechat.deleteMessage()\`:
${JSON.stringify(yield api.livechat.deleteMessage(_id, { token, rid }), null, '\t')}

Send Livechat Offline Message \`api.livechat.sendOfflineMessage()\`:
${JSON.stringify(yield api.livechat.sendOfflineMessage(mock_1.mockOfflineMessage), null, '\t')}

Send Livechat Visitor Navigation \`api.livechat.sendVisitorNavigation()\`:
${JSON.stringify(yield api.livechat.sendVisitorNavigation(roomCredential, pageInfo), null, '\t')}

  `);
    });
}
messages().catch((e) => console.error(e));
//# sourceMappingURL=messages.js.map