/**
 * @module ApiLivechat
 * Provides a client for making requests with Livechat Rocket.Chat's REST API
 */

import {
	ILivechatTokenAPI,
	ILivechatRoomCredentialAPI,
	ILivechatRoomSurveyAPI,
	INewLivechatGuestAPI,
	INewLivechatMessageAPI,
	ILivechatRoomMessagesAPI,
	INewLivechatNavigationAPI,
	INewLivechatCustomFieldAPI,
	INewLivechatOfflineMessageAPI,
	INewLivechatCustomFieldsAPI,
	ILivechatRoom
} from '../../interfaces'

import ApiBase from './api'

export default class ApiLivechat extends ApiBase {
  credentials: ILivechatRoomCredentialAPI = {} as any
  login (guest: INewLivechatGuestAPI | any) { return this.grantVisitor(guest) }
  async config (params?: ILivechatTokenAPI) { return (await this.get('livechat/config', params, false)).config }
  async room () { return (await this.get('livechat/room', { token: this.credentials.token }, false)).room }
  closeChat ({ rid }: ILivechatRoom) { return this.post('livechat/room.close', { rid, token: this.credentials.token }, false) }
  transferChat ({ rid, department }: ILivechatRoom) { return (this.post('livechat/room.transfer', { rid, token: this.credentials.token, department }, false)) }
  chatSurvey (survey: ILivechatRoomSurveyAPI) { return (this.post('livechat/room.survey', { rid: survey.rid, token: this.credentials.token, data: survey.data }, false)) }
  visitor (params: ILivechatTokenAPI) { return this.get(`livechat/visitor/${params.token}`) }
  async grantVisitor (guest: INewLivechatGuestAPI) {
    const { visitor } = await this.post('livechat/visitor', guest, false)
    this.credentials = {
      token: visitor.token
    }
    return visitor
	 }
  agent ({ rid }: any) { return this.get(`livechat/agent.info/${rid}/${this.credentials.token}`) }
  nextAgent ({ department }: any) { return this.get(`livechat/agent.next/${this.credentials.token}`, { department }) }
  sendMessage (message: INewLivechatMessageAPI) { return (this.post('livechat/message', { ...message, token: this.credentials.token }, false)) }
  editMessage (id: string, message: INewLivechatMessageAPI) { return (this.put(`livechat/message/${id}`, message, false)) }
  deleteMessage (id: string, { rid }: ILivechatRoom) { return (this.del(`livechat/message/${id}`, { rid, token: this.credentials.token }, false)) }
  async loadMessages (rid: string, params?: ILivechatRoomMessagesAPI) { return (await this.get(`livechat/messages.history/${rid}`, { ...params, token: this.credentials.token }, false)).messages }
  sendOfflineMessage (message: INewLivechatOfflineMessageAPI) { return (this.post('livechat/offline.message', { ...message, token: this.credentials.token }, false)) }
  sendVisitorNavigation ({ rid }: ILivechatRoom, page: INewLivechatNavigationAPI) { return (this.post('livechat/page.visited', { token: this.credentials.token, rid, ...page }, false)) }
  requestTranscript (email: string, { rid }: ILivechatRoom) { return (this.post('livechat/transcript', { token: this.credentials.token, rid, email }, false)) }
  videoCall ({ rid }: ILivechatRoom) { return this.get(`livechat/video.call/${this.credentials.token}`, { rid }, false) }
  sendCustomField (field: INewLivechatCustomFieldAPI) { return this.post('livechat/custom.field', field, false) }
  sendCustomFields (fields: INewLivechatCustomFieldsAPI) { return this.post('livechat/custom.fields', fields, false) }
}
