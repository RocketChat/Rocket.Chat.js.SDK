/** Structure for livechat token field api */
export interface ILivechatTokenAPI {
  token: string
}

/** Structure for livechat room credential api */
export interface ILivechatRoomCredentialAPI {
  token: string
  rid?: string
  department?: string
}

/** Structure for livechat room messages api */
export interface ILivechatRoomMessagesAPI {
  token: string   // Visitor token
  ts?: string     // ISO timestamp
  end?: string    // ISO timestamp
  limit: number   // number of messages to load
}

/** Payload structure for livechat `room.transfer` endpoint */
export interface ILivechatRoomTransferAPI {
  token: string
  department: string
}

/** Payload structure for livechat survey values */
export interface ILivechatSurveyAPI {
  name: 'satisfaction' | 'agentKnowledge' | 'agentResposiveness' | 'agentFriendliness'
  value: '1' | '2' | '3' | '4' | '5'
}

/** Payload structure for livechat `room.transfer` endpoint */
export interface ILivechatRoomSurveyAPI {
  token: string
  rid: string
  data?: ILivechatSurveyAPI[] // See surcvey interface above
}

/** Livechat New Room object structure */
export interface ILivechatNewRoomAPI {
  _id: string           // Room ID
  _updatedAt: string    // ISO timestamp
  t: 'r'                // Room type (channel, private, direct, livechat)
  msgs: number          // Count of messages in room
  ts: string            // ISO timestamp (current time in room?)
  lm?: string           // ISO timestamp (last message)
  open?: boolean        // Room status
  departmentId?: string // Livechat Department _id
  fname: string         // Room display name
  v: {
	  _id: number         // Visitor ID
	  token: string       // Visitor token
	  username: number    // Visitor username
  }
}

/** Result structure for room creation (e.g. DM) */
export interface ILivechatNewRoomResultAPI {
  room: ILivechatNewRoomAPI
  newRoom: boolean
  success: boolean
}

/** Custom Field object structure for livechat endpoints */
export interface ILivechatGuestCustomFieldAPI {
  key: string
  value: string
  overwrite: boolean
}

/** Payload structure for new Livechat Visitors */
export interface ILivechatGuestAPI {
  token: string
  name?: string
  email?: string
  department?: string
  phone?: string
  username?: string
  customFields?: ILivechatGuestCustomFieldAPI[]
}

/** Visitor object structure for livechat endpoints */
export interface INewLivechatGuestAPI {
  visitor: ILivechatGuestAPI
}

/** Payload structure for new Livechat Message */
export interface INewLivechatMessageAPI {
  _id?: string          // Message ID
  msg: string           // Message text
  token: string         // Livechat Token
  rid: string           // Room ID
  agent?: {
    agentId: string
    username: string
  }
}

/** Result structure for visitor emails */
export interface ILivechatEmailAPI {
  address: string,
  verified?: boolean
}

/** Result structure for visitor phones */
export interface ILivechatVisitorPhoneAPI {
  phoneNumber: string
}

/** Result structure for visitor prop */
export interface ILivechatVisitorAPI {
  token: string
  _updatedAt: string
  name?: string
  phone?: ILivechatVisitorPhoneAPI[]
  username: string
  visitorEmails?: ILivechatEmailAPI[]
  livechatData?: object
}

/** Result structure for visitor creation */
export interface ILivechatVisitorResultAPI {
  visitor: ILivechatVisitorAPI
  success: boolean
}

/** Result structure for config survey */
export interface ILivechatConfigSurveyAPI {
  items: ['satisfaction', 'agentKnowledge', 'agentResposiveness', 'agentFriendliness']
  values: ['1', '2', '3', '4', '5']
}

/** Result structure for config prop */
export interface ILivechatConfigAPI {
  enabled: boolean
  online?: boolean
  settings?: object
  theme?: object
  messages?: object
  survey?: ILivechatConfigSurveyAPI,
  guest?: ILivechatGuestAPI
}

/** Result structure for Livechat config */
export interface ILivechatConfigResultAPI {
  config: ILivechatConfigAPI
  success: boolean
}

/** Livechat Room object structure */
export interface ILivechatRoomAPI {
  _id: string           // Room ID
  open?: boolean        // Room status
  departmentId?: string // Livechat Department _id
  servedBy: {
	  _id: number         // Agent ID
    username: number    // Agent username
  }
}

/** Result structure for room */
export interface ILivechatRoomResultAPI {
  room: ILivechatRoomAPI
  success: boolean
}

/** Livechat Agent object structure */
export interface ILivechatAgentAPI {
  _id: string           // Agent ID
  name: string          // Agent name
  username: string      // Agent username
  emails: ILivechatEmailAPI[]
}

/** Result structure for agent */
export interface ILivechatAgentResultAPI {
  agent: ILivechatAgentAPI
  success: boolean
}

/** Livechat Message object structure */
export interface ILivechatMessageAPI {
  msg: string
  u: {
    _id: string
    username: string
    name: string
  }
  ts: string
}

/** Result structure for Livechat Message */
export interface ILivechatMessageResultAPI {
  message: ILivechatMessageAPI
  success: boolean
}

/** Payload structure for new Livechat Offline Message */
export interface INewLivechatOfflineMessageAPI {
  name: string          // Message Name
  email: string         // Message email
  message: string       // Message text
}

/** Result structure for Livechat Offline Message */
export interface ILivechatOfflineMessageResultAPI {
  message: string
  success: boolean
}

/** Navigation object structure for livechat endpoints */
export interface ILivechatNavigation {
  change: string      // Action (Url or Page Title)
  title: string       // Page Title
  location: {
    href: string
  }
  token?: string
}

/** Payload structure for new Livechat Visitor Navigation */
export interface INewLivechatNavigationAPI {
  token: string         // Livechat Token
  rid: string           // Room ID
  pageInfo: ILivechatNavigation
}

/** Result structure for Livechat Navigation */
export interface ILivechatNavigationResultAPI {
  page?: {
    msg: string
    navigation: ILivechatNavigation
  }
  success: boolean
}

/** Result structure for Livechat Transcript */
export interface ILivechatTranscriptResultAPI {
  message: string
  success: boolean
}

/** Livechat VideoCall object structure */
export interface ILivechatVideoCallAPI {
  rid: string           // Room ID
  domain: string        // Video Call provider domain
  provider: string      // Video Call provider name
  room: string          // Video Call room
}

/** Result structure for Livechat VideoCall */
export interface ILivechatVideoCallResultAPI {
  videoCall: ILivechatVideoCallAPI
  success: boolean
}

/** Payload structure for new Livechat CustomField */
export interface ILivechaCustomFieldAPI {
  key: string
  value: string
  overwrite: boolean
}

/** Livechat CustomField object structure */
export interface INewLivechatCustomFieldAPI {
  token: string        // Visitor token
  key: string          // CustomField key
  value: string        // CustomField value
  overwrite: boolean   // Overwrite CustomField value if exists
}

/** Result structure for Livechat CustomField */
export interface ILivechatCustomFieldResultAPI {
  field: ILivechaCustomFieldAPI
  success: boolean
}

/** Structure for Livechat CustomFields api */
export interface INewLivechatCustomFieldsAPI {
  token: string   // Visitor token
  customFields: ILivechaCustomFieldAPI[]
}

/** Result structure for Livechat CustomFields */
export interface ILivechatCustomFieldsResultAPI {
  fields: ILivechaCustomFieldAPI[]
  success: boolean
}
