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
// Test script uses standard methods and env config to connect and log streams
var api = require("../lib/api");
var log_1 = require("../lib/log");
log_1.silence();
function users() {
    return __awaiter(this, void 0, void 0, function () {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v;
        return __generator(this, function (_w) {
            switch (_w.label) {
                case 0:
                    _b = (_a = console).log;
                    _c = "\n\nDemo of API user query helpers\n\nALL users `api.users.all()`:\n";
                    _e = (_d = JSON).stringify;
                    return [4 /*yield*/, api.users.all()];
                case 1:
                    _f = _c + _e.apply(_d, [_w.sent(), null, '\t']) + "\n\nALL usernames `api.users.allNames()`:\n";
                    _h = (_g = JSON).stringify;
                    return [4 /*yield*/, api.users.allNames()];
                case 2:
                    _j = _f + _h.apply(_g, [_w.sent(), null, '\t']) + "\n\nALL IDs `api.users.allIDs()`:\n";
                    _l = (_k = JSON).stringify;
                    return [4 /*yield*/, api.users.allIDs()];
                case 3:
                    _m = _j + _l.apply(_k, [_w.sent(), null, '\t']) + "\n\nONLINE users `api.users.online()`:\n";
                    _p = (_o = JSON).stringify;
                    return [4 /*yield*/, api.users.online()];
                case 4:
                    _q = _m + _p.apply(_o, [_w.sent(), null, '\t']) + "\n\nONLINE usernames `api.users.onlineNames()`:\n";
                    _s = (_r = JSON).stringify;
                    return [4 /*yield*/, api.users.onlineNames()];
                case 5:
                    _t = _q + _s.apply(_r, [_w.sent(), null, '\t']) + "\n\nONLINE IDs `api.users.onlineIds()`:\n";
                    _v = (_u = JSON).stringify;
                    return [4 /*yield*/, api.users.onlineIds()];
                case 6:
                    _b.apply(_a, [_t + _v.apply(_u, [_w.sent(), null, '\t']) + "\n\n  "]);
                    return [2 /*return*/];
            }
        });
    });
}
users()["catch"](function (e) { return console.error(e); });
