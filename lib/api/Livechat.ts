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
	ILivechatRoom,
	INewLivechatRoomCredentialAPI,
	ILivechatUploadAPI
} from '../../interfaces'

import ApiBase from './api'

export default class ApiLivechat extends ApiBase {
  credentials: ILivechatRoomCredentialAPI = {} as any
  login (guest: INewLivechatGuestAPI | any) { return this.grantVisitor(guest) }
  async config (params?: ILivechatTokenAPI) { return (await this.get('livechat/config', params, false)).config }
  async room (params?: INewLivechatRoomCredentialAPI) { return (await this.get('livechat/room', { token: this.credentials.token, ...params }, false)).room }
  closeChat ({ rid }: ILivechatRoom) { return this.post('livechat/room.close', { rid, token: this.credentials.token }, false) }
  transferChat ({ rid, department }: ILivechatRoom) { return (this.post('livechat/room.transfer', { rid, token: this.credentials.token, department }, false)) }
  chatSurvey (survey: ILivechatRoomSurveyAPI) { return (this.post('livechat/room.survey', { rid: survey.rid, token: this.credentials.token, data: survey.data }, false)) }
  visitor () { return this.get(`livechat/visitor/${this.credentials.token}`) }
  async grantVisitor (guest: INewLivechatGuestAPI) {
    const { visitor } = await this.post('livechat/visitor', guest, false)
    this.credentials = {
      token: visitor.token
    }
    return visitor
  }
  async deleteVisitor () { return (await this.del(`livechat/visitor/${this.credentials.token}`)).visitor }
  async updateVisitorStatus (status: string) { return (await this.post(`livechat/visitor.status`, { token: this.credentials.token, status })).status }
  async nextAgent (department: string = '') { return (await this.get(`livechat/agent.next/${this.credentials.token}`, { department })).agent }
  async agent ({ rid }: any) { return (await this.get(`livechat/agent.info/${rid}/${this.credentials.token}`)).agent }
  async message (id: string, params: ILivechatRoom) { return (await this.get(`livechat/message/${id}`, { token: this.credentials.token, ...params })).message }
  sendMessage (message: INewLivechatMessageAPI) { return (this.post('livechat/message', { ...message, token: this.credentials.token }, false)) }
  editMessage (id: string, message: INewLivechatMessageAPI) { return (this.put(`livechat/message/${id}`, message, false)) }
  deleteMessage (id: string, { rid }: ILivechatRoom) { return (this.del(`livechat/message/${id}`, { rid, token: this.credentials.token }, false)) }
  async loadMessages (rid: string, params?: ILivechatRoomMessagesAPI) { return (await this.get(`livechat/messages.history/${rid}`, { ...params, token: this.credentials.token }, false)).messages }
  async sendOfflineMessage (message: INewLivechatOfflineMessageAPI) { return (await this.post('livechat/offline.message', { ...message }, false)).message }
  sendVisitorNavigation (page: INewLivechatNavigationAPI) { return (this.post('livechat/page.visited', { ...page }, false)) }
  requestTranscript (email: string, { rid }: ILivechatRoom) { return (this.post('livechat/transcript', { token: this.credentials.token, rid, email }, false)) }
  videoCall ({ rid }: ILivechatRoom) { return this.get(`livechat/video.call/${this.credentials.token}`, { rid }, false) }
  sendCustomField (field: INewLivechatCustomFieldAPI) { return this.post('livechat/custom.field', field, false) }
  sendCustomFields (fields: INewLivechatCustomFieldsAPI) { return this.post('livechat/custom.fields', fields, false) }
  uploadFile (params: ILivechatUploadAPI) {
    const formData = new FormData()
    const headersNeededForUpload = {
      'x-visitor-token': this.credentials.token
    }
    formData.append('file', params.file)
    return this.post(`livechat/upload/${params.rid}`, formData, false, undefined, { customHeaders: headersNeededForUpload })
  }
}
