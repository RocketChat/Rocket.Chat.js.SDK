/**
 * @module ApiLivechat
 * Provides a client for making requests with Livechat Rocket.Chat's REST API
 */

import {
	ILogger,
	ILivechatTokenAPI,
	ILivechatRoomCredentialAPI,
	ILivechatRoomSurveyAPI,
	INewLivechatGuestAPI,
	INewLivechatMessageAPI,
	ILivechatRoomMessagesAPI,
	INewLivechatNavigationAPI,
	INewLivechatCustomFieldAPI,
	INewLivechatOfflineMessageAPI,
	INewLivechatCustomFieldsAPI
} from '../../interfaces'

import ApiBase from './api'

export default class ApiLivechat extends ApiBase {
  config (params: ILivechatTokenAPI) { return this.get('livechat/config', params, false) }
  room (credentials: ILivechatRoomCredentialAPI) { return this.get('livechat/room', credentials, false) }
  closeChat (credentials: ILivechatRoomCredentialAPI) { return (this.post('livechat/room.close', { rid: credentials.rid, token: credentials.token }, false)) }
  transferChat (credentials: ILivechatRoomCredentialAPI) { return (this.post('livechat/room.transfer', { rid: credentials.rid, token: credentials.token, department: credentials.department }, false)) }
  chatSurvey (survey: ILivechatRoomSurveyAPI) { return (this.post('livechat/room.survey', { rid: survey.rid, token: survey.token, data: survey.data }, false)) }
  visitor (params: ILivechatTokenAPI) { return this.get(`livechat/visitor/${params.token}`) }
  grantVisitor (guest: INewLivechatGuestAPI) { return (this.post('livechat/visitor', guest, false)) }
  agent (credentials: ILivechatRoomCredentialAPI) { return this.get(`livechat/agent.info/${credentials && credentials.rid}/${credentials && credentials.token}`) }
  nextAgent (credentials: ILivechatRoomCredentialAPI) { return this.get(`livechat/agent.next/${credentials && credentials.token}`, { department: credentials.department }) }
  sendMessage (message: INewLivechatMessageAPI) { return (this.post('livechat/message', message, false)) }
  editMessage (id: string, message: INewLivechatMessageAPI) { return (this.put(`livechat/message/${id}`, message, false)) }
  deleteMessage (id: string, credentials: ILivechatRoomCredentialAPI) { return (this.del(`livechat/message/${id}`, credentials, false)) }
  loadMessages (id: string, params: ILivechatRoomMessagesAPI) { return this.get(`livechat/messages.history/${id}`, params, false) }
  sendOfflineMessage (message: INewLivechatOfflineMessageAPI) { return (this.post('livechat/offline.message', message, false)) }
  sendVisitorNavigation (credentials: ILivechatRoomCredentialAPI, page: INewLivechatNavigationAPI) { return (this.post('livechat/page.visited', { token: credentials.token, rid: credentials.rid, ...page }, false)) }
  requestTranscript (email: string, credentials: ILivechatRoomCredentialAPI) { return (this.post('livechat/transcript', { token: credentials.token, rid: credentials.rid, email }, false)) }
  videoCall (credentials: ILivechatRoomCredentialAPI) { return this.get(`livechat/video.call/${credentials.token}`, { rid: credentials.rid }, false) }
  sendCustomField (field: INewLivechatCustomFieldAPI) { return this.post('livechat/custom.field', field, false) }
  sendCustomFields (fields: INewLivechatCustomFieldsAPI) { return this.post('livechat/custom.fields', fields, false) }
}
