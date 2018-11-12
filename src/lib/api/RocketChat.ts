/**
	* @module ApiRocketChat
	* Provides a client for handling requests with Rocket.Chat's REST API
	*/

export type RID = string
import {
	IUserAPI,
	IMessage,
	IChannelAPI,
	IGroupAPI,
	IMessageReceipt
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
      onlineIds () { return self.get('users.list', { fields: { '_id': 1 }, query: { 'status': { $ne: 'offline' } } }).then((r: any) => r.users.map((u: IUserAPI) => u._id)) },
      async info (username: string): Promise<IUserAPI> { return (await self.get('users.info', { username }, true)).user }
    }
  }

  get rooms (): any {
    const self = this
    return {
      info ({ rid }: any) { return self.get('rooms.info', { rid }, true) }
    }
  }

	// editMessage(message: IMessage) chat.update
  joinRoom ({ rid }: any) { return this.post('channels.join', { roomId: rid }, true) }

  async info () { return (await this.get('info', {}, true)).info }
	/**
	 * Send a prepared message object (with pre-defined room ID).
	 * Usually prepared and called by sendMessageByRoomId or sendMessageByRoom.
	 */
  async sendMessage (message: IMessage | string, rid: string): Promise<IMessageReceipt> { return (await this.post('chat.sendMessage', { message: this.prepareMessage(message, rid) })).message }
  getRoomIdByNameOrId (name: string): Promise<RID> { return this.get('chat.getRoomIdByNameOrId', { name }, true) }
  getRoomNameById (rid: RID): Promise<string> { return this.getRoomName(rid) }
  async getRoomName (rid: string): Promise<string> {
    const room = await this.get('chat.getRoomNameById', { rid }, true)
    return room.name
  }
  getRoomId (name: string) { return this.get('chat.find', { name }, true) }
  async createDirectMessage (username: string) { return (await this.post('im.create', { username }, true)).room }

/**
 * Edit an existing message, replacing any attributes with those provided.
 * The given message object should have the ID of an existing message.
 */
  editMessage (message: IMessage): Promise<IMessageReceipt> {
    return this.post('chat.update', { roomId: message.rid, msgId: message._id, text: message.msg })
  }
	/**
	 * Send a reaction to an existing message. Simple proxy for method call.
	 * @param emoji     Accepts string like `:thumbsup:` to add 👍 reaction
	 * @param messageId ID for a previously sent message
	 */
  setReaction (emoji: string, messageId: string) { return this.post('chat.react', { emoji, messageId }, true) }

	// TODO fix this methods

  async loadHistory (rid: string, lastUpdate: Date): Promise<{
    updated: IMessage[],
    deleted: IMessage[]
  }> {
    return (await this.get('chat.syncMessages', { roomId: rid, lastUpdate: lastUpdate.toISOString() }, true)).result
  }
	/** Exit a room the bot has joined */
  leaveRoom (rid: string): Promise<RID> {
    return this.post('rooms.leave', { rid }).then(() => rid)
  }

	/** Get information about a public group */
  async channelInfo (query: { roomName?: string, roomId?: string }) {
    return (await this.get('channels.info', query, true)).channel as Promise<IChannelAPI>
  }

	/** Get information about a private group */
  async privateInfo (query: { roomName?: string, roomId?: string }) {
    return (await this.get('groups.info', query, true)).group as Promise<IGroupAPI>
  }
}
