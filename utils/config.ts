import {
  INewUserAPI,
  INewLivechatGuestAPI,
  ILivechatSurveyAPI,
  INewLivechatOfflineMessageAPI,
  INewLivechatNavigationAPI,
  INewLivechatCustomFieldAPI,
  INewLivechatCustomFieldsAPI
} from '../interfaces'

// The API user, should be provisioned on build with local Rocket.Chat
export const apiUser: INewUserAPI = {
  username: process.env.ADMIN_USERNAME || 'admin',
  password: process.env.ADMIN_PASS || 'pass'
}

// The Bot user, will attempt to login and run methods in tests
export const botUser: INewUserAPI = {
  email: 'bit-bucket+bot@test.smtp.org',
  name: 'Bot',
  password: process.env.ROCKETCHAT_PASSWORD || 'pass',
  username: process.env.ROCKETCHAT_USER || 'bot',
  active: true,
  roles: ['bot'],
  joinDefaultChannels: true,
  requirePasswordChange: false,
  sendWelcomeEmail: false,
  verified: true
}

// The Mock user, will send messages via API for the bot to respond to
export const mockUser: INewUserAPI = {
  email: 'bit-bucket+user@test.smtp.org',
  name: 'Mock User',
  password: 'mock',
  username: 'mock',
  active: true,
  roles: ['user'],
  joinDefaultChannels: false,
  requirePasswordChange: false,
  sendWelcomeEmail: false,
  verified: true
}

// @todo fix custom field handling, either by using pre-test script to add
//       required fields to test instance or by handling error without failing
export const mockVisitor: INewLivechatGuestAPI = {
  visitor: {
    name: 'Livechat Visitor',
    email: 'visitor@rocket.chat',
    token: '123456789',
    phone: '55 51 5555-5555'
    // customFields: [{
    //   key: 'address',
    //   value: 'Rocket.Chat street',
    //   overwrite: true
    // }]
  }
}

export const mockSurvey: ILivechatSurveyAPI[] = [
  {
    name: 'satisfaction',
    value: '3'
  },
  {
    name: 'agentResponsiveness',
    value: '5'
  }
]

export const mockOfflineMessage: INewLivechatOfflineMessageAPI = {
  name: 'Livechat Visitor',
  email: 'sample@rocket.chat',
  message: 'This is a Message!'
}

export const mockVisitorNavigation: INewLivechatNavigationAPI = {
  token: '123456789',
  rid: '',
  pageInfo: {
    change: 'url',
    title: 'Livechat Demo Page',
    location: {
      href: 'http://localhost:3000/assets/demo.html#page-1'
    }
  }
}

export const mockCustomField: INewLivechatCustomFieldAPI = {
  key: 'address',
  value: 'Rocket.Chat Avenue',
  overwrite: true
}

export const mockCustomFields: INewLivechatCustomFieldsAPI = {
  token: '123456789',
  customFields: [
    {
      key: 'address',
      value: 'Rocket.Chat Avenue - Porto Alegre',
      overwrite: true
    },
    {
      key: 'state',
      value: 'RS',
      overwrite: true
    }
  ]
}
