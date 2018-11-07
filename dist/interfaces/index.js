/** Password login credential type guard */
export function isLoginPass(params) {
    return (params.user &&
        params.password &&
        params.user.username !== undefined &&
        params.password.digest !== undefined);
}
/** Password login credential type guard */
export function isLoginOAuth(params) {
    return (params.oath &&
        params.credentialToken !== undefined &&
        params.credentialSecret !== undefined);
}
/** Password login credential type guard */
export function isLoginAuthenticated(params) {
    return (params.resume !== undefined);
}
/** Password login credential type guard */
export function isLoginResult(params) {
    return (params.token !== undefined);
}
//# sourceMappingURL=index.js.map