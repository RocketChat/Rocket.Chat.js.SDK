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

  private usersApi: any
  private roomsApi: any

  get users (): any {
    if (!this.usersApi) {
      this.usersApi = {
        all: (fields: any = userFields) => this.get('users.list', { fields }).then((r: any) => r.users),
        allNames: () => this.get('users.list', { fields: { 'username': 1 } }).then((r: any) => r.users.map((u: IUserAPI) => u.username)),
        allIDs: () => this.get('users.list', { fields: { '_id': 1 } }).then((r: any) => r.users.map((u: IUserAPI) => u._id)),
        online: (fields: any = userFields) => this.get('users.list', { fields, query: { 'status': { $ne: 'offline' } } }).then((r: any) => r.users),
        onlineNames: () => this.get('users.list', { fields: { 'username': 1 }, query: { 'status': { $ne: 'offline' } } }).then((r: any) => r.users.map((u: IUserAPI) => u.username)),
        onlineIds: () => this.get('users.list', { fields: { '_id': 1 }, query: { 'status': { $ne: 'offline' } } }).then((r: any) => r.users.map((u: IUserAPI) => u._id)),
        info: async (username: string): Promise<IUserAPI> => (await this.get('users.info', { username })).user
      }
    }
    return this.usersApi
  }

  get rooms (): any {
    if (!this.roomsApi) {
      this.roomsApi = {
        info: ({ rid }: any) => this.get('rooms.info', { rid })
      }
    }
    return this.roomsApi
  }

	// editMessage(message: IMessage) chat.update
  joinRoom ({ rid }: any) { return this.post('channels.join', { roomId: rid }) }

  async info () { return (await this.get('info', {})).info }
	/**
	 * Send a prepared message object (with pre-defined room ID).
	 * Usually prepared and called by sendMessageByRoomId or sendMessageByRoom.
	 */
  async sendMessage (message: IMessage | string, rid: string): Promise<IMessageReceipt> { return (await this.post('chat.sendMessage', { message: this.prepareMessage(message, rid) })).message }
  getRoomIdByNameOrId (name: string): Promise<RID> { return this.get('chat.getRoomIdByNameOrId', { name }) }
  getRoomNameById (rid: RID): Promise<string> { return this.getRoomName(rid) }
  async getRoomName (rid: string): Promise<string> {
    const room = await this.get('chat.getRoomNameById', { rid })
    return room.name
  }
  getRoomId (name: string) { return this.get('chat.find', { name }) }
  async createDirectMessage (username: string) { return (await this.post('im.create', { username })).room }

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
  setReaction (emoji: string, messageId: string) { return this.post('chat.react', { emoji, messageId }) }

	// TODO fix this methods

  async loadHistory (rid: string, lastUpdate: Date): Promise<{
    updated: IMessage[],
    deleted: IMessage[]
  }> {
    return (await this.get('chat.syncMessages', { roomId: rid, lastUpdate: lastUpdate.toISOString() })).result
  }
	/** Exit a room the bot has joined */
  leaveRoom (rid: string): Promise<RID> {
    return this.post('rooms.leave', { rid }).then(() => rid)
  }

	/** Get information about a public group */
  async channelInfo (query: { roomName?: string, roomId?: string }) {
    return (await this.get('channels.info', query)).channel as Promise<IChannelAPI>
  }

	/** Get information about a private group */
  async privateInfo (query: { roomName?: string, roomId?: string }) {
    return (await this.get('groups.info', query)).group as Promise<IGroupAPI>
  }
}
