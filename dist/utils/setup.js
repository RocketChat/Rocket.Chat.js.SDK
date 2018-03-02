"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("./api");
const config_1 = require("./config");
function setup() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield api_1.post('/api/v1/login', config_1.apiUser); // Login - stores auth token
            yield api_1.post('/api/v1/users.create', config_1.botUser, true); // Create user for bot
            yield api_1.post('/api/v1/logout', true); // Logout - invalidates token
        }
        catch (err) {
            api_1.handle(err);
        }
    });
}
exports.setup = setup;
//# sourceMappingURL=setup.js.map