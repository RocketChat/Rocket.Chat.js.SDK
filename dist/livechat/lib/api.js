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
    config: (params) => api.get('livechat/config', params).then((r) => r),
    room: (credentials) => api.get('livechat/room', credentials).then((r) => r),
    closeChat: (credentials) => (api.post('livechat/room.close', { rid: credentials.rid, token: credentials.token }, false)).then((r) => r),
    transferChat: (credentials) => (api.post('livechat/room.transfer', { rid: credentials.rid, token: credentials.token, department: credentials.department }, false)).then((r) => r),
    chatSurvey: (survey) => (api.post('livechat/room.survey', { rid: survey.rid, token: survey.token, data: survey.data }, false)).then((r) => r),
    visitor: (params) => api.get(`livechat/visitor/${params.token}`).then((r) => r),
    grantVisitor: (guest) => (api.post('livechat/visitor', guest, false)).then((r) => r),
    agent: (credentials) => api.get(`livechat/agent.info/${credentials && credentials.rid}/${credentials && credentials.token}`).then((r) => r),
    nextAgent: (credentials) => api.get(`livechat/agent.next/${credentials && credentials.token}`, { department: credentials.department }).then((r) => r),
    sendMessage: (message) => (api.post('livechat/message', message, false)).then((r) => r),
    editMessage: (id, message) => (api.put(`livechat/message/${id}`, message, false)).then((r) => r),
    deleteMessage: (id, credentials) => (api.del(`livechat/message/${id}`, credentials, false)).then((r) => r),
    loadMessages: (id, params) => api.get(`livechat/messages.history/${id}`, params).then((r) => r),
    sendOfflineMessage: (message) => (api.post('livechat/offline.message', message, false)).then((r) => r),
    sendVisitorNavigation: (credentials, page) => (api.post('livechat/page.visited', Object.assign({ token: credentials.token, rid: credentials.rid }, page), false)).then((r) => r),
    requestTranscript: (email, credentials) => (api.post('livechat/transcript', { token: credentials.token, rid: credentials.rid, email }, false)).then((r) => r),
    videoCall: (credentials) => (api.get(`livechat/video.call/${credentials.token}`, { rid: credentials.rid }, false)).then((r) => r),
    sendCustomField: (field) => (api.post('livechat/custom.field', field, false)).then((r) => r),
    sendCustomFields: (fields) => (api.post('livechat/custom.fields', fields, false)).then((r) => r)
};
//# sourceMappingURL=api.js.map