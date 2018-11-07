"use strict";
/**
 * @module ApiLivechat
 * Provides a client for making requests with Livechat Rocket.Chat's REST API
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = __importDefault(require("./api"));
class ApiLivechat extends api_1.default {
    config(params) { return this.get('livechat/config', params, false); }
    room(credentials) { return this.get('livechat/room', credentials, false); }
    closeChat(credentials) { return (this.post('livechat/room.close', { rid: credentials.rid, token: credentials.token }, false)); }
    transferChat(credentials) { return (this.post('livechat/room.transfer', { rid: credentials.rid, token: credentials.token, department: credentials.department }, false)); }
    chatSurvey(survey) { return (this.post('livechat/room.survey', { rid: survey.rid, token: survey.token, data: survey.data }, false)); }
    visitor(params) { return this.get(`livechat/visitor/${params.token}`); }
    grantVisitor(guest) { return (this.post('livechat/visitor', guest, false)); }
    agent(credentials) { return this.get(`livechat/agent.info/${credentials && credentials.rid}/${credentials && credentials.token}`); }
    nextAgent(credentials) { return this.get(`livechat/agent.next/${credentials && credentials.token}`, { department: credentials.department }); }
    sendMessage(message) { return (this.post('livechat/message', message, false)); }
    editMessage(id, message) { return (this.put(`livechat/message/${id}`, message, false)); }
    deleteMessage(id, credentials) { return (this.del(`livechat/message/${id}`, credentials, false)); }
    loadMessages(id, params) { return this.get(`livechat/messages.history/${id}`, params, false); }
    sendOfflineMessage(message) { return (this.post('livechat/offline.message', message, false)); }
    sendVisitorNavigation(credentials, page) { return (this.post('livechat/page.visited', Object.assign({ token: credentials.token, rid: credentials.rid }, page), false)); }
    requestTranscript(email, credentials) { return (this.post('livechat/transcript', { token: credentials.token, rid: credentials.rid, email }, false)); }
    videoCall(credentials) { return this.get(`livechat/video.call/${credentials.token}`, { rid: credentials.rid }, false); }
    sendCustomField(field) { return this.post('livechat/custom.field', field, false); }
    sendCustomFields(fields) { return this.post('livechat/custom.fields', fields, false); }
}
exports.default = ApiLivechat;
//# sourceMappingURL=Livechat.js.map