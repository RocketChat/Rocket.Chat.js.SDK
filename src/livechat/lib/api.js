"use strict";
var __assign = (this && this.__assign) || function () {
  __assign = Object.assign || function (t) {
    for (var s, i = 1, n = arguments.length; i < n; i++) {
      s = arguments[i];
      for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
        t[p] = s[p];
    }
    return t;
  };
  return __assign.apply(this, arguments);
};
exports.__esModule = true;
var api = require("../../lib/api");
/** Query helpers for livechat REST requests */
exports.livechat = {
  config: function (params) { return api.get('livechat/config', params).then(function (r) { return r; }); },
  room: function (credentials) { return api.get('livechat/room', credentials).then(function (r) { return r; }); },
  closeChat: function (credentials) { return (api.post('livechat/room.close', { rid: credentials.rid, token: credentials.token }, false)).then(function (r) { return r; }); },
  transferChat: function (credentials) { return (api.post('livechat/room.transfer', { rid: credentials.rid, token: credentials.token, department: credentials.department }, false)).then(function (r) { return r; }); },
  chatSurvey: function (survey) { return (api.post('livechat/room.survey', { rid: survey.rid, token: survey.token, data: survey.data }, false)).then(function (r) { return r; }); },
  visitor: function (params) { return api.get("livechat/visitor/" + params.token).then(function (r) { return r; }); },
  grantVisitor: function (guest) { return (api.post('livechat/visitor', guest, false)).then(function (r) { return r; }); },
  agent: function (credentials) { return api.get("livechat/agent.info/" + (credentials && credentials.rid) + "/" + (credentials && credentials.token)).then(function (r) { return r; }); },
  nextAgent: function (credentials) { return api.get("livechat/agent.next/" + (credentials && credentials.token), { department: credentials.department }).then(function (r) { return r; }); },
  sendMessage: function (message) { return (api.post('livechat/message', message, false)).then(function (r) { return r; }); },
  editMessage: function (id, message) { return (api.put("livechat/message/" + id, message, false)).then(function (r) { return r; }); },
  deleteMessage: function (id, credentials) { return (api.del("livechat/message/" + id, credentials, false)).then(function (r) { return r; }); },
  loadMessages: function (id, params) { return api.get("livechat/messages.history/" + id, params).then(function (r) { return r; }); },
  sendOfflineMessage: function (message) { return (api.post('livechat/offline.message', message, false)).then(function (r) { return r; }); },
  sendVisitorNavigation: function (credentials, page) { return (api.post('livechat/page.visited', __assign({ token: credentials.token, rid: credentials.rid }, page), false)).then(function (r) { return r; }); },
  requestTranscript: function (email, credentials) { return (api.post('livechat/transcript', { token: credentials.token, rid: credentials.rid, email: email }, false)).then(function (r) { return r; }); },
  videoCall: function (credentials) { return (api.get("livechat/video.call/" + credentials.token, { rid: credentials.rid }, false)).then(function (r) { return r; }); },
  sendCustomField: function (field) { return (api.post('livechat/custom.field', field, false)).then(function (r) { return r; }); },
  sendCustomFields: function (fields) { return (api.post('livechat/custom.fields', fields, false)).then(function (r) { return r; }); }
};
