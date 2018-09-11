"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const api = __importStar(require("../../lib/api"));
/** Query helpers for livechat REST requests */
exports.livechat = {
    config: (params) => api.get(`livechat/config/${params && params.token}`).then((r) => r),
    room: (params) => api.get('livechat/room', params).then((r) => r),
    closeChat: (params) => (api.post(`livechat/room.close/${params.rid}`, { token: params.token }, false)).then((r) => r),
    transferChat: (params) => (api.post(`livechat/room.transfer/${params.rid}`, { token: params.token, department: params.department }, false)).then((r) => r),
    chatSurvey: (params) => (api.post(`livechat/room.survey/${params.rid}`, { token: params.token, data: params.data }, false)).then((r) => r),
    visitor: (params) => api.get(`livechat/visitor/${params.token}`).then((r) => r),
    grantVisitor: (visitor) => (api.post('livechat/visitor', visitor, false)).then((r) => r),
    agent: (params) => api.get(`livechat/agent.info/${params && params.rid}/${params && params.token}`).then((r) => r),
    nextAgent: (params) => api.get(`livechat/agent.next/${params && params.token}`, { department: params.department }).then((r) => r),
    sendMessage: (message) => (api.post('livechat/message', message, false)).then((r) => r),
    editMessage: (id, message) => (api.put(`livechat/message/${id}`, message, false)).then((r) => r),
    deleteMessage: (id, params) => (api.del(`livechat/message/${id}`, params, false)).then((r) => r),
    loadMessages: (id, params) => api.get(`livechat/messages.history/${id}`, params).then((r) => r),
    sendOfflineMessage: (message) => (api.post('livechat/offline.message', message, false)).then((r) => r),
};
//# sourceMappingURL=api.js.map