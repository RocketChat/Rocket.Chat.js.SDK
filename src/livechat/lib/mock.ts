import {
  INewLivechatGuestAPI,
  ILivechatSurveyAPI,
  INewLivechatOfflineMessageAPI,
  INewLivechatNavigationAPI,
  INewLivechatCustomFieldAPI,
  INewLivechatCustomFieldsAPI
} from './Interfaces'

export const mockVisitor: INewLivechatGuestAPI = {
  visitor: {
    name: 'Livechat Visitor',
    email: 'visitor@rocket.chat',
    token: '123456789',
    phone: '55 51 5555-5555',
    customFields: [{
      key: 'address',
      value: 'Rocket.Chat street',
      overwrite: true
    }]
  }
}

export const mockSurvey: ILivechatSurveyAPI[] = [
  {
    name: 'satisfaction',
    value: '3'
  },
  {
    name: 'agentResposiveness',
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
  token: '123456789',
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
