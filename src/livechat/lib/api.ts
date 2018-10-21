import * as api from '../../lib/api'
import {
  ILivechatTokenAPI,
  ILivechatRoomCredentialAPI,
  ILivechatRoomResultAPI,
  INewLivechatGuestAPI,
  ILivechatVisitorResultAPI,
  ILivechatConfigResultAPI,
  ILivechatRoomSurveyAPI,
  ILivechatAgentResultAPI,
  INewLivechatMessageAPI,
  ILivechatMessageResultAPI,
  ILivechatRoomMessagesAPI,
  INewLivechatOfflineMessageAPI,
  ILivechatOfflineMessageResultAPI,
  INewLivechatNavigationAPI,
  ILivechatNavigationResultAPI,
  ILivechatTranscriptResultAPI,
  ILivechatVideoCallResultAPI,
  INewLivechatCustomFieldAPI,
  ILivechatCustomFieldResultAPI,
  INewLivechatCustomFieldsAPI,
  ILivechatCustomFieldsResultAPI
} from './Interfaces'

/** Query helpers for livechat REST requests */
export const livechat: any = {
  config: (params: ILivechatTokenAPI) => api.get('livechat/config', params, false).then((r: ILivechatConfigResultAPI) => r),
  room: (credentials: ILivechatRoomCredentialAPI) => api.get('livechat/room', credentials, false).then((r: ILivechatRoomResultAPI) => r),
  closeChat: (credentials: ILivechatRoomCredentialAPI) => (api.post('livechat/room.close', { rid: credentials.rid, token: credentials.token }, false)).then((r) => r),
  transferChat: (credentials: ILivechatRoomCredentialAPI) => (api.post('livechat/room.transfer', { rid: credentials.rid, token: credentials.token, department: credentials.department }, false)).then((r) => r),
  chatSurvey: (survey: ILivechatRoomSurveyAPI) => (api.post('livechat/room.survey', { rid: survey.rid, token: survey.token, data: survey.data }, false)).then((r) => r),
  visitor: (params: ILivechatTokenAPI) => api.get(`livechat/visitor/${params.token}`).then((r: ILivechatVisitorResultAPI) => r),
  grantVisitor: (guest: INewLivechatGuestAPI) => (api.post('livechat/visitor', guest, false)).then((r: ILivechatVisitorResultAPI) => r),
  agent: (credentials: ILivechatRoomCredentialAPI) => api.get(`livechat/agent.info/${credentials && credentials.rid}/${credentials && credentials.token}`).then((r: ILivechatAgentResultAPI) => r),
  nextAgent: (credentials: ILivechatRoomCredentialAPI) => api.get(`livechat/agent.next/${credentials && credentials.token}`, { department: credentials.department }).then((r: ILivechatAgentResultAPI) => r),
  sendMessage: (message: INewLivechatMessageAPI) => (api.post('livechat/message', message, false)).then((r: ILivechatMessageResultAPI) => r),
  editMessage: (id: string, message: INewLivechatMessageAPI) => (api.put(`livechat/message/${id}`, message, false)).then((r: ILivechatMessageResultAPI) => r),
  deleteMessage: (id: string, credentials: ILivechatRoomCredentialAPI) => (api.del(`livechat/message/${id}`, credentials, false)).then((r) => r),
  loadMessages: (id: string, params: ILivechatRoomMessagesAPI) => api.get(`livechat/messages.history/${id}`, params, false).then((r) => r),
  sendOfflineMessage: (message: INewLivechatOfflineMessageAPI) => (api.post('livechat/offline.message', message, false)).then((r: ILivechatOfflineMessageResultAPI) => r),
  sendVisitorNavigation: (credentials: ILivechatRoomCredentialAPI, page: INewLivechatNavigationAPI) => (api.post('livechat/page.visited', { token: credentials.token, rid: credentials.rid, ...page }, false)).then((r: ILivechatNavigationResultAPI) => r),
  requestTranscript: (email: string, credentials: ILivechatRoomCredentialAPI) => (api.post('livechat/transcript', { token: credentials.token, rid: credentials.rid, email }, false)).then((r: ILivechatTranscriptResultAPI) => r),
  videoCall: (credentials: ILivechatRoomCredentialAPI) => (api.get(`livechat/video.call/${credentials.token}`, { rid: credentials.rid }, false)).then((r: ILivechatVideoCallResultAPI) => r),
  sendCustomField: (field: INewLivechatCustomFieldAPI) => (api.post('livechat/custom.field', field, false)).then((r: ILivechatCustomFieldResultAPI) => r),
  sendCustomFields: (fields: INewLivechatCustomFieldsAPI) => (api.post('livechat/custom.fields', fields, false)).then((r: ILivechatCustomFieldsResultAPI) => r)
}
