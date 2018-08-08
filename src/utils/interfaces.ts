/** Payload structure for `chat.postMessage` endpoint */
export interface IMessageAPI {
  roomId: string       // The room id of where the message is to be sent
  channel?: string     // The channel name with the prefix in front of it
  text?: string        // The text of the message to send, is optional because of attachments
  alias?: string       // This will cause the messenger name to appear as the given alias, but username will still display
  emoji?: string       // If provided, this will make the avatar on this message be an emoji
  avatar?: string      // If provided, this will make the avatar use the provided image url
  attachments?: IAttachmentAPI[] // See attachment interface below
}

/** Payload structure for `chat.update` endpoint */
export interface IMessageUpdateAPI {
  roomId: string       // The room id of where the message is
  msgId: string        // The message id to update
  text: string         // Updated text for the message
}

/** Message receipt returned after send (not the same as sent object) */
export interface IMessageReceiptAPI {
  _id: string           // ID of sent message
  rid: string          // Room ID of sent message
  alias: string        // ?
  msg: string          // Content of message
  parseUrls: boolean   // URL parsing enabled on message hooks
  groupable: boolean   // Grouping message enabled
  ts: string           // Timestamp of message creation
  u: {                 // User details of sender
    _id: string
    username: string
  }
  _updatedAt: string   // Time message last updated
  editedAt?: string    // Time updated by edit
  editedBy?: {          // User details for the updater
    _id: string
    username: string
  }
}

/** Payload structure for message attachments */
export interface IAttachmentAPI {
  color?: string        // The color you want the order on the left side to be, any value background-css supports
  text?: string         // The text to display for this attachment, it is different than the message text
  ts?: string           // ISO timestamp, displays the time next to the text portion
  thumb_url?: string    // An image that displays to the left of the text, looks better when this is relatively small
  message_link?: string // Only applicable if the ts is provided, as it makes the time clickable to this link
  collapsed?: boolean   // Causes the image, audio, and video sections to be hiding when collapsed is true
  author_name?: string  // Name of the author
  author_link?: string  // Providing this makes the author name clickable and points to this link
  author_icon?: string  // Displays a tiny icon to the left of the author's name
  title?: string        // Title to display for this attachment, displays under the author
  title_link?: string   // Providing this makes the title clickable, pointing to this link
  title_link_download_true?: string // When this is true, a download icon appears and clicking this saves the link to file
  image_url?: string    // The image to display, will be “big” and easy to see
  audio_url?: string    // Audio file to play, only supports what html audio does
  video_url?: string    // Video file to play, only supports what html video does
  fields?: IAttachmentFieldAPI[] // An array of Attachment Field Objects
}

/**
 * Payload structure for attachment field object
 * The field property of the attachments allows for “tables” or “columns” to be displayed on messages
 */
export interface IAttachmentFieldAPI {
  short?: boolean  // Whether this field should be a short field
  title: string    // The title of this field
  value: string     // The value of this field, displayed underneath the title value
}

/** Result structure for message endpoints */
export interface IMessageResultAPI {
  ts: number           // Seconds since unix epoch
  channel: string      // Name of channel without prefix
  message: IMessageReceiptAPI // Sent message
  success: boolean      // Send status
}

/** User object structure for creation endpoints */
export interface INewUserAPI {
  email?: string                  // Email address
  name?: string                   // Full name
  password: string                // User pass
  username: string                // Username
  active?: true                   // Subscription is active
  roles?: string[]                // Role IDs
  joinDefaultChannels?: boolean   // Auto join channels marked as default
  requirePasswordChange?: boolean // Direct to password form on next login
  sendWelcomeEmail?: boolean      // Send new credentials in email
  verified?: true                  // Email address verification status
}

/** User object structure for queries (not including admin access level) */
export interface IUserAPI {
  _id: string          // MongoDB user doc ID
  type: string         // user / bot ?
  status: string       // online | offline
  active: boolean      // Subscription is active
  name: string         // Full name
  utcOffset: number    // Hours off UTC/GMT
  username: string     // Username
}

/** Result structure for user data request (by non-admin) */
export interface IUserResultAPI {
  user: IUserAPI       // The requested user
  success: boolean     // Status of request
}

/** Room object structure */
export interface IRoomAPI {
  _id: string          // Room ID
  _updatedAt: string   // ISO timestamp
  t: 'c' | 'p' | 'd' | 'l' // Room type (channel, private, direct, livechat)
  msgs: number         // Count of messages in room
  ts: string           // ISO timestamp (current time in room?)
  meta: {
    revision: number   // ??
    created: number    // Unix ms>epoch time
    version: number     // ??
  }
}

/** Channel result schema */
export interface IChannelAPI {
  _id: string          // Channel ID
  name: string         // Channel name
  t: 'c' | 'p' | 'l'   // Channel type (channel always c)
  msgs: number         // Count of messages in room
  u: {
    _id: string        // Owner user ID
    username: string    // Owner username
  }
  ts: string           // ISO timestamp (current time in room?)
  default: boolean     // Is default channel
}

/** Group result schema */
export interface IGroupAPI {
  _id: string          // Group ID
  name: string         // Group name
  usernames: string[]  // Users in group
  t: 'c' | 'p' | 'l'   // Group type (private always p)
  msgs: number         // Count of messages in room
  u: {
    _id: string        // Owner user ID
    username: string   // Owner username
  }
  ts: string           // ISO timestamp (current time in room?)
  default: boolean     // Is default channel (would be false)
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
