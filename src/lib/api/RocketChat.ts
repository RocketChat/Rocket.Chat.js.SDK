/**
	* @module ApiRocketChat
	* Provides a client for handling requests with Rocket.Chat's REST API
	*/

export type RID = string
import {
	ILogger,
	IAPIRequest,
	IUserAPI,
	ICredentials,
	ILoginResultAPI,
	ICredentialsAPI,
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
	ILivechatCustomFieldsResultAPI,
	IMessage
} from '../../interfaces'

import ApiBase from './api'

/** Defaults for user queries */
export const userFields = { name: 1, username: 1, status: 1, type: 1 }

/** Query helpers for user collection requests */
export default class ApiRocketChat extends ApiBase {

  get users (): any {
    const self = this
    return {
      all (fields: any = userFields) { return self.get('users.list', { fields }).then((r: any) => r.users) },
      allNames () { return self.get('users.list', { fields: { 'username': 1 } }).then((r: any) => r.users.map((u: IUserAPI) => u.username)) },
      allIDs () { return self.get('users.list', { fields: { '_id': 1 } }).then((r: any) => r.users.map((u: IUserAPI) => u._id)) },
      online (fields: any = userFields) { return self.get('users.list', { fields, query: { 'status': { $ne: 'offline' } } }).then((r: any) => r.users) },
      onlineNames () { return self.get('users.list', { fields: { 'username': 1 }, query: { 'status': { $ne: 'offline' } } }).then((r: any) => r.users.map((u: IUserAPI) => u.username)) },
      onlineIds () { return self.get('users.list', { fields: { '_id': 1 }, query: { 'status': { $ne: 'offline' } } }).then((r: any) => r.users.map((u: IUserAPI) => u._id)) }
    }
  }

	// editMessage(message: IMessage) chat.update
  joinRoom (rid: string) { return this.post('channels.join', { roomId: rid }, true) }
	/** Exit a room the bot has joined */
  leaveRoom (rid: string): Promise<RID> {
    return this.post('rooms.leave', { rid }).then(() => rid)
  }

  info () { return this.get('info', {}, true) }
	/**
	 * Send a prepared message object (with pre-defined room ID).
	 * Usually prepared and called by sendMessageByRoomId or sendMessageByRoom.
	 */
  sendMessage (message: IMessage) { return this.post('chat.sendMessage', { message }) }
  getRoomIdByNameOrId (name: string): Promise<RID> { return this.get('chat.getRoomIdByNameOrId', { name }, true) }
  getRoomNameById (name: RID): Promise<string> { return this.getRoomName(name) }
  getRoomName (rid: string): Promise<string> { return this.get('chat.getRoomNameById', { rid }, true) }
  getRoomId (name: string) { return this.get('chat.find', { name }, true) }
  async createDirectMessage (username: string) { return (await this.post('im.create', { username }, true)).room }

/**
 * Edit an existing message, replacing any attributes with those provided.
 * The given message object should have the ID of an existing message.
 */
  editMessage (message: IMessage): Promise<IMessage> {
    return this.post('chat.update', message)
  }
	/**
	 * Send a reaction to an existing message. Simple proxy for method call.
	 * @param emoji     Accepts string like `:thumbsup:` to add 👍 reaction
	 * @param messageId ID for a previously sent message
	 */
  setReaction (emoji: string, messageId: string) { return this.get('chat.react', { emoji, messageId }, true) }

}
