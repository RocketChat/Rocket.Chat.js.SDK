/** Loggers need to provide the same set of methods */
export interface ILogger {
  debug: (...args: any[]) => void
  info: (...args: any[]) => void
  warning: (...args: any[]) => void
  warn: (...args: any[]) => void
  error: (...args: any[]) => void
}

/**
 * Connection options type
 * @param host        Host URL:PORT, converted to websocket protocol
 * @param useSsl      Use SSL (https/wss) to connect
 * @param timeout     How long to wait (ms) before abandoning connection
 * @param reopen      ms interval before attempting reopens on disconnect
 * @param ping        ms interval between each ping
 * @param close       ms interval to wait for socket close to succeed
 * @param integration Name added to message `bot` attribute to identify SDK use
 */
export interface ISocketOptions {
  host: string
  useSsl: boolean
  timeout: number
  reopen: number
  ping: number
  close: number
  integration: string
}

/**
 * DDP Message Handler defines attributes to match on incoming messages and
 * fire a callback. There may be multiple handlers for any given message.
 * @param callback    Function to call when matching message received
 * @param persist     Optionally (true) to continue using handler after matching
 * @param msg         The `data.msg` value to match in message
 * @param id          The `data.id` value to match in message
 * @param collection  The `data.collection` value to match in message
 */
export interface ISocketMessageHandler {
  callback: ISocketMessageCallback
  persist?: boolean
  msg?: string
  id?: string
  collection?: string
}

/** Function interface for DDP message handler callback */
export interface ISocketMessageCallback {
  (data: any): void
}

/**
 * Message respond options
 * @param rooms       Respond to only selected room/s (names or IDs)
 * @param allPublic   Respond on all public channels (ignores rooms if true)
 * @param dm          Respond to messages in DM / private chats
 * @param livechat    Respond to messages in livechat
 * @param edited      Respond to edited messages
 */
export interface IRespondOptions {
  rooms?: string[]
  allPublic?: boolean
  dm?: boolean
  livechat?: boolean
  edited?: boolean
}

/** User credentials generic interface */
export interface ICredentials {
  password: string
  username: string
  email?: string
  ldap?: boolean
  ldapOptions?: object
}

/** User credentials for password login method */
export interface ICredentialsPass {
  user: { username: string }
  password: { digest: string, algorithm: string }
}

/** Password login credential type guard */
export function isLoginPass (params: any): params is ICredentialsPass {
  return (
    params.user &&
    params.password &&
    params.user.username !== undefined &&
    params.password.digest !== undefined
  )
}

/** User credentials for oath login method  */
export interface ICredentialsOAuth {
  oauth: { credentialToken: string, credentialSecret: string }
}

/** Password login credential type guard */
export function isLoginOAuth (params: any): params is ICredentialsOAuth {
  return (
    params.oath &&
    params.credentialToken !== undefined &&
    params.credentialSecret !== undefined
  )
}

/** User credentials for authenticated login method */
export interface ICredentialsAuthenticated {
  resume: string
}

/** Password login credential type guard */
export function isLoginAuthenticated (params: any): params is ICredentialsAuthenticated {
  return (params.resume !== undefined)
}

/**
 * Response from login method (called by websocket)
 * @todo make test to inspect websocket login result interface
 */
export interface ILoginResult {
  id: string, // userId
  token: string,
  createCipher: { '$date': number }
}

/** Password login credential type guard */
export function isLoginResult (params: any): params is ILoginResult {
  return (params.token !== undefined)
}

/** Credentials for logging into API */
export interface ICredentialsAPI {
  username: string
  password: string
}

/**
 * Result object from an API login
 * @param status      e.g. 'success'
 * @param data        Logged in user data
 * @param data.authToken Login renewal token
 * @param userId      ID of logged-in user
 */
export interface ILoginResultAPI {
  status: string // e.g. 'success'
  data: {
    authToken: string
    userId: string
  }
}

/** Error-first callback param type */
export interface ICallback {
  (error: Error | null, ...args: any[]): void
}

/** Error-first callback for message stream events */
export interface IMessageCallback {
  (error: Error | null, message?: IMessage, meta?: IMessageMeta): void
}

/**
 * Websocket stream subscription
 * @param id          Subscription ID
 * @param name        Stream/collection name
 * @param unsubscribe Method for unsubscribing
 */
export interface ISubscription {
  id?: string
  name?: any
  unsubscribe: () => Promise<any>
  [key: string]: any
}

/**
 * Subscription events (changes) in message stream
 * @param msg         The event type (usually 'change')
 * @param collection  Streamed collection name, e.g. 'stream-room-messages'
 * @param id          Collection ID (some streams don't include other than 'id')
 * @param fields      Emitted event arguments
 * @param fields.eventName The room or sub-collection name for this event
 * @param fields.args Event rgs, for message events it will be message and meta
 */
export interface ISubscriptionEvent {
  msg: string
  collection: 'stream-room-messages'
  id: 'id'
  fields: {
    eventName: '__my_messages__'
    args: [ IMessage, IMessageMeta ]
  }
}

/**
 * API result for channel.history request
 * @todo Incomplete
 */
export interface IHistoryAPI {
  messages: IMessageReceipt[]
}

/**
 * Message schema
 * @param rid         Room ID
 * @param _id         Mongo collection ID generated by Random.id()
 * @param t           Room type e.g. "c" for channel
 * @param msg         Text content
 * @param alias       ?
 * @param emoji       Emoji to use as avatar
 * @param avatar      URL of avatar image
 * @param groupable   Group with consecutive messages
 * @param bot         Integration details
 * @param urls        ?
 * @param mentions    ?
 * @param u           User who sent the message
 * @param ts          Message created timestamp
 * @param editedBy    User who edited the message
 * @param editedAt    When the message was edited
 * @todo contribute these to @types/rocketchat and require
 */
export interface IMessage {
  rid: string | null
  _id?: string
  t?: string
  msg?: string
  alias?: string
  emoji?: string
  avatar?: string
  groupable?: boolean
  bot?: any
  urls?: string[]
  mentions?: string[]
  attachments?: IMessageAttachment[]
  reactions?: IMessageReaction
  location ?: IMessageLocation
  u?: IUser
  ts?: { '$date': Date }
  editedBy?: IUser
  editedAt?: { '$date': Date }
}

/**
 * Extra details emitted about message in stream events.
 * @param roomParticipant If the logged in user was joined to the room
 * @param roomType    Type of room (public, private, DM, livechat)
 * @param roomName    The room name if public or named private group
 */
export interface IMessageMeta {
  roomParticipant: boolean
  roomType: RoomType
  roomName?: 'general'
}

/**
 * Message receipt returned after send (not the same as sent object).
 * @todo Confirm why/if this is actually different to IMessage, e.g. msg vs text
 * @param _id         ID of sent message
 * @param rid         Room ID of sent message
 * @param alias       ?
 * @param msg         Content of message
 * @param parseUrls   URL parsing enabled on message hooks
 * @param groupable   Grouping message enabled
 * @param ts          Timestamp of message creation
 * @param _updatedAt  Time message last updated
 * @param editedAt    Time updated by edit
 */
export interface IMessageReceipt {
  _id: string
  rid: string
  alias: string
  msg: string
  parseUrls: boolean
  groupable: boolean
  ts: string
  _updatedAt: string
  editedAt?: string
  u: IUser
  editedBy?: IUser
  attachments?: IAttachmentAPI[]
  reactions?: IMessageReaction
}

/**
 * Payload structure for `chat.postMessage` endpoint
 * @param roomId      The room id of where the message is to be sent
 * @param channel     The channel name with the prefix in front of it
 * @param text        The text of the message to send is optional because of attachments
 * @param alias       This will cause the messenger name to appear as the given alias but username will still display
 * @param emoji       If provided this will make the avatar on this message be an emoji
 * @param avatar      If provided this will make the avatar use the provided image url
 */
export interface IMessageAPI {
  roomId: string
  channel?: string
  text?: string
  alias?: string
  emoji?: string
  avatar?: string
  attachments?: IAttachmentAPI[]
}

/**
 * Payload structure for `chat.update` endpoint
 * @param roomId      The room id of where the message is
 * @param msgId       The message id to update
 * @param text        Updated text for the message
 */
export interface IMessageUpdateAPI {
  roomId: string
  msgId: string
  text: string
}

/** Message Attachment schema */
export interface IMessageAttachment {
  fields?: IAttachmentField[]
  actions?: IMessageAction[]
  color?: string
  text?: string
  ts?: string
  thumb_url?: string
  message_link?: string
  collapsed?: boolean
  author_name?: string
  author_link?: string
  author_icon?: string
  title?: string
  title_link?: string
  title_link_download?: string
  image_url?: string
  audio_url?: string
  video_url?: string
}

/** Attachment field schema */
export interface IAttachmentField {
  short?: boolean
  title?: string
  value?: string
}

/** Message emoji reaction attribute schema (emoji: [usernames that reacted]) */
export interface IMessageReaction {
  [emoji: string]: { usernames: string[] }
}

/** Rich message action schema */
export interface IMessageAction {
  type?: string
  text?: string
  url?: string
  image_url?: string
  is_webview?: boolean
  webview_height_ratio?: 'compact' | 'tall' | 'full'
  msg?: string
  msg_in_chat_window?: boolean
  button_alignment?: 'vertical' | 'horizontal'
  temporary_buttons?: boolean
}

/** Geo-location attribute schema */
export interface IMessageLocation {
  type: string                // e.g. Point
  coordinates: string[]       // longitude latitude
}

/**
 * Payload structure for message attachments
 * @param color       The color you want the order on the left side to be any value background-css supports
 * @param text        The text to display for this attachment it is different than the message text
 * @param ts          ISO timestamp displays the time next to the text portion
 * @param thumb_url   An image that displays to the left of the text looks better when this is relatively small
 * @param message_link Only applicable if the ts is provided as it makes the time clickable to this link
 * @param collapsed   Causes the image audio and video sections to be hiding when collapsed is true
 * @param author_name Name of the author
 * @param author_link Providing this makes the author name clickable and points to this link
 * @param author_icon Displays a tiny icon to the left of the author's name
 * @param title       Title to display for this attachment displays under the author
 * @param title_link  Providing this makes the title clickable pointing to this link
 * @param title_link_download_true When this is true a download icon appears and clicking this saves the link to file
 * @param image_url   The image to display will be “big” and easy to see
 * @param audio_url   Audio file to play only supports what html audio does
 * @param video_url   Video file to play only supports what html video does
 */
export interface IAttachmentAPI {
  color?: string
  text?: string
  ts?: string
  thumb_url?: string
  message_link?: string
  collapsed?: boolean
  author_name?: string
  author_link?: string
  author_icon?: string
  title?: string
  title_link?: string
  title_link_download_true?: string
  image_url?: string
  audio_url?: string
  video_url?: string
  fields?: IAttachmentFieldAPI[]
}

/**
 * Payload structure for attachment field object
 * The field property of the attachments allows for “tables” or “columns” to be displayed on messages
 * @param short       Whether this field should be a short field
 * @param title       The title of this field
 * @param value       The value of this field displayed underneath the title value
 */
export interface IAttachmentFieldAPI {
  short?: boolean
  title: string
  value: string
}

/**
 * Result structure for message endpoints
 * @param ts          Seconds since unix epoch
 * @param channel     Name of channel without prefix
 * @param message     Sent message
 * @param success     Send status
 */
export interface IMessageResultAPI {
  ts: number
  channel: string
  message: IMessageReceipt
  success: boolean
}

/**
 * User (as attribute) schema
 * @param _id         Mongo collection ID generated by Random.id()
 * @param username    Username
 * @param name        Display name
 */
export interface IUser {
  _id: string
  username: string
  name?: string
}

/**
 * User object structure for creation endpoints
 * @param email       Email address
 * @param name        Full name
 * @param password    User pass
 * @param username    Username
 * @param active      Subscription is active
 * @param roles       Role IDs
 * @param joinDefaultChannels Auto join channels marked as default
 * @param requirePasswordChange Direct to password form on next login
 * @param sendWelcomeEmail  Send new credentials in email
 * @param verified    Email address verification status
 */
export interface INewUserAPI {
  email?: string
  name?: string
  password: string
  username: string
  active?: true
  roles?: string[]
  joinDefaultChannels?: boolean
  requirePasswordChange?: boolean
  sendWelcomeEmail?: boolean
  verified?: true
}

/**
 * User object structure for queries (not including admin access level)
 * @param _id         MongoDB user doc ID
 * @param type        user / bot ?
 * @param status      online | offline
 * @param active      Subscription is active
 * @param name        Full name
 * @param utcOffset   Hours off UTC/GMT
 * @param username    Username
 */
export interface IUserAPI {
  _id: string
  type: string
  status: string
  active: boolean
  name: string
  utcOffset: number
  username: string
}

/**
 * Result structure for user data request (by non-admin)
 * @param user    The requested user
 * @param success Status of request
 */
export interface IUserResultAPI {
  user: IUserAPI
  success: boolean
}

/** Room type literal (channel private direct livechat) */
export type RoomType = 'c' | 'p' | 'd' | 'l'

/**
 * Room object structure from API
 * @param _id         Room ID
 * @param _updatedAt  ISO timestamp
 * @param ts          ISO timestamp (current time in room?)
 * @param msgs        Count of messages in room
 */
export interface IRoomAPI {
  t: RoomType
  _id: string
  _updatedAt: string
  ts: string
  msgs: number
  meta: IRoomMetaAPI
}

/** Room result meta from API */
export interface IRoomMetaAPI {
  revision: number
  created: number
  version: number
}

/**
 * Channel result schema
 * @param _id         Channel ID
 * @param name        Channel name
 * @param default     Is default channel
 * @param ts          ISO timestamp (current time in room?)
 * @param msgs        Count of messages in room
 */
export interface IChannelAPI {
  t: RoomType
  _id: string
  name: string
  default: boolean
  ts: string
  msgs: number
  u: IUser
}

/**
 * Group (private room) result schema
 * @param _id         Group ID
 * @param name        Group name
 * @param default     Is default channel (would be false)
 * @param usernames   Users in group
 * @param msgs        Count of messages in room
 * @param ts          ISO timestamp (current time in room?)
 */
export interface IGroupAPI {
  t: RoomType
  _id: string
  name: string
  default: boolean
  usernames: string[]
  msgs: number
  ts: string
  u: IUser
}

/** Result structure for room creation (e.g. DM) */
export interface IRoomResultAPI {
  room: IRoomAPI
  success: boolean
}

/** Result structure for channel creation */
export interface IChannelResultAPI {
  channel: IChannelAPI
  success: boolean
}

/** Result structure for group creation */
export interface IGroupResultAPI {
  group: IGroupAPI
  success: boolean
}
