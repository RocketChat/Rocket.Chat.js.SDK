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
function rooms() {
    return __awaiter(this, void 0, void 0, function* () {
        const token = yield getVisitorToken();
        const room = yield getRoom(token);
        const rid = room && room._id;
        const department = settings.deparmentId;
        const email = 'sample@rocket.chat';
        console.log(`

Demo of API livechat query helpers

\`api.livechat.room()\`:
${JSON.stringify(room, null, '\t')}

Transfer Livechat \`api.livechat.tranferChat()\`:
${JSON.stringify(yield api.livechat.transferChat({ rid, token, department }), null, '\t')}

Livechat Survey \`api.livechat.chatSurvey()\`:
${JSON.stringify(yield api.livechat.chatSurvey({ rid, token, data: mock_1.mockSurvey }), null, '\t')}

Request Livechat VideoCall \`api.livechat.videoCall()\`:
${JSON.stringify(yield api.livechat.videoCall({ rid, token }), null, '\t')}

Close Livechat Room \`api.livechat.closeChat()\`:
${JSON.stringify(yield api.livechat.closeChat({ rid, token }), null, '\t')}

Request Livechat Transcript \`api.livechat.requestTranscript()\`:
${JSON.stringify(yield api.livechat.requestTranscript(email, { rid, token }), null, '\t')}

  `);
    });
}
rooms().catch((e) => console.error(e));
//# sourceMappingURL=rooms.js.map