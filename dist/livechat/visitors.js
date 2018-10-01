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
log_1.silence();
const { token } = mock_1.mockVisitor.visitor;
function visitors() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log(`

Demo of API livechat query helpers

Create Livechat Visitor \`api.livechat.grantVisitor()\`:
${JSON.stringify(yield api.livechat.grantVisitor(mock_1.mockVisitor), null, '\t')}

Add new Livechat CustomField \`api.livechat.sendCustomField()\`:
${JSON.stringify(yield api.livechat.sendCustomField(mock_1.mockCustomField), null, '\t')}

Add new Livechat CustomFields \`api.livechat.sendCustomFields()\`:
${JSON.stringify(yield api.livechat.sendCustomFields(mock_1.mockCustomFields), null, '\t')}

\`api.livechat.visitor()\`:
${JSON.stringify(yield api.livechat.visitor({ token }), null, '\t')}

	`);
    });
}
visitors().catch((e) => console.error(e));
//# sourceMappingURL=visitors.js.map