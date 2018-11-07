"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/** Password login credential type guard */
function isLoginPass(params) {
    return (params.user &&
        params.password &&
        params.user.username !== undefined &&
        params.password.digest !== undefined);
}
exports.isLoginPass = isLoginPass;
/** Password login credential type guard */
function isLoginOAuth(params) {
    return (params.oath &&
        params.credentialToken !== undefined &&
        params.credentialSecret !== undefined);
}
exports.isLoginOAuth = isLoginOAuth;
/** Password login credential type guard */
function isLoginAuthenticated(params) {
    return (params.resume !== undefined);
}
exports.isLoginAuthenticated = isLoginAuthenticated;
/** Password login credential type guard */
function isLoginResult(params) {
    return (params.token !== undefined);
}
exports.isLoginResult = isLoginResult;
//# sourceMappingURL=index.js.map