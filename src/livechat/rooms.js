"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
exports.__esModule = true;
var api = require("./lib/api");
var log_1 = require("../lib/log");
var mock_1 = require("./lib/mock");
var settings = require("./lib/settings");
log_1.silence();
function getVisitorToken() {
    return __awaiter(this, void 0, void 0, function () {
        var token, visitor;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log('\nPreparing visitor token for tests...');
                    token = settings.token;
                    if (!(!token || token === '')) return [3 /*break*/, 2];
                    return [4 /*yield*/, api.livechat.grantVisitor(mock_1.mockVisitor)];
                case 1:
                    visitor = (_a.sent()).visitor;
                    token = visitor && visitor.token;
                    _a.label = 2;
                case 2: return [2 /*return*/, token];
            }
        });
    });
}
function getRoom(token) {
    return __awaiter(this, void 0, void 0, function () {
        var room;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log('\nPreparing room for tests...');
                    return [4 /*yield*/, api.livechat.room({ token: token })];
                case 1:
                    room = (_a.sent()).room;
                    return [2 /*return*/, room];
            }
        });
    });
}
function rooms() {
    return __awaiter(this, void 0, void 0, function () {
        var token, room, rid, department, email, _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s;
        return __generator(this, function (_t) {
            switch (_t.label) {
                case 0: return [4 /*yield*/, getVisitorToken()];
                case 1:
                    token = _t.sent();
                    return [4 /*yield*/, getRoom(token)];
                case 2:
                    room = _t.sent();
                    rid = room && room._id;
                    department = settings.deparmentId;
                    email = 'sample@rocket.chat';
                    _b = (_a = console).log;
                    _c = "\n\nDemo of API livechat query helpers\n\n`api.livechat.room()`:\n" + JSON.stringify(room, null, '\t') + "\n\nTransfer Livechat `api.livechat.tranferChat()`:\n";
                    _e = (_d = JSON).stringify;
                    return [4 /*yield*/, api.livechat.transferChat({ rid: rid, token: token, department: department })];
                case 3:
                    _f = _c + _e.apply(_d, [_t.sent(), null, '\t']) + "\n\nLivechat Survey `api.livechat.chatSurvey()`:\n";
                    _h = (_g = JSON).stringify;
                    return [4 /*yield*/, api.livechat.chatSurvey({ rid: rid, token: token, data: mock_1.mockSurvey })];
                case 4:
                    _j = _f + _h.apply(_g, [_t.sent(), null, '\t']) + "\n\nRequest Livechat VideoCall `api.livechat.videoCall()`:\n";
                    _l = (_k = JSON).stringify;
                    return [4 /*yield*/, api.livechat.videoCall({ rid: rid, token: token })];
                case 5:
                    _m = _j + _l.apply(_k, [_t.sent(), null, '\t']) + "\n\nClose Livechat Room `api.livechat.closeChat()`:\n";
                    _p = (_o = JSON).stringify;
                    return [4 /*yield*/, api.livechat.closeChat({ rid: rid, token: token })];
                case 6:
                    _q = _m + _p.apply(_o, [_t.sent(), null, '\t']) + "\n\nRequest Livechat Transcript `api.livechat.requestTranscript()`:\n";
                    _s = (_r = JSON).stringify;
                    return [4 /*yield*/, api.livechat.requestTranscript(email, { rid: rid, token: token })];
                case 7:
                    _b.apply(_a, [_q + _s.apply(_r, [_t.sent(), null, '\t']) + "\n\n  "]);
                    return [2 /*return*/];
            }
        });
    });
}
rooms()["catch"](function (e) { return console.error(e); });
