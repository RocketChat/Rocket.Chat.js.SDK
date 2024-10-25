import 'mocha'
import { expect } from 'chai'
import { silence } from '../log'
const initEnv = process.env // store configs to restore after tests
import {
  botUser,
  mockUser,
  mockVisitor,
  mockSurvey,
  mockVisitorNavigation,
  mockOfflineMessage,
  mockCustomField,
  mockCustomFields
} from '../../utils/config'
import BotDriver from '../clients/Bot'
import ClientApi from './RocketChat'

import LivechatApi from './Livechat'
import * as settings from '../settings'
import { IMessage } from '../../interfaces'
global.fetch = require('node-fetch')
global.FormData = require('form-data')
// silence() // suppress log during tests (disable this while developing tests)

const clientApi = new ClientApi({})
const livechatApi = new LivechatApi({})
const driver = new BotDriver({})

// livechat data, to be populated in before hooks
let department = settings.department
let room: any
let rid: any
let newMessage: any
let editMessage: any
let pageInfo: any
let email = 'sample@rocket.chat'

describe.skip('.livechat', () => {
  before(async () => {
    try {

      const visitor = await livechatApi.grantVisitor(mockVisitor)
      const room = await livechatApi.room()
      rid = room._id
      newMessage = { rid, msg: 'sending livechat message...' }
      editMessage = { rid, msg: 'editing livechat message...' }
      pageInfo = Object.assign({}, mockVisitorNavigation, { rid })
    } catch (error) {
      console.log(error)
    }
  })
  describe('.config', () => {
    it('returns data from basic Livechat initial config', async () => {
      const result = await livechatApi.config()
      expect(200)
      expect(result).to.have.property('success', true)
      expect(result).to.have.property('config')
      expect(result.config).to.include.all.keys([
        'enabled', 'settings', 'theme', 'messages', 'survey'
      ])
    })
    it('returns data from Livechat config with a valid token', async () => {
      const { token } = mockVisitor.visitor
      const result = await livechatApi.config({ token })
      expect(200)
      expect(result).to.have.property('success', true)
      expect(result).to.have.property('config')
      expect(result.config).to.include.all.keys([
        'enabled', 'settings', 'theme', 'messages', 'survey', 'guest', 'room', 'agent'
      ])
    })
  })
  describe('.rooms', () => {
    (department ? it : it.skip)('requests a Livechat transfer', async () => { // TODO CHECK
      const room = await livechatApi.transferChat({ rid, department })
      expect('Content-Type', 'application/json')
      expect(200)
      expect(room).to.have.property('servedBy')
      expect(room).to.have.property('open')
      expect(room).to.have.property('departmentId')
    })
    it('sends a Livechat survey', async () => {
      console.log({ rid, data: mockSurvey })
      const result = await livechatApi.chatSurvey({ rid, data: mockSurvey })
      expect('Content-Type', 'application/json')
      expect(200)
      expect(result).to.have.property('rid')
    })
    it('requests a Livechat video call', async () => {
      const result = await livechatApi.videoCall({ rid })
      expect('Content-Type', 'application/json')
      expect(200)
      expect(result).to.have.property('success', true)
      expect(result).to.have.property('videoCall')
    })
    it.skip('close a Livechat room', async () => {
      const result = await livechatApi.closeChat({ rid })
      expect('Content-Type', 'application/json')
      expect(200)
      expect(result).to.have.property('success', true)
      expect(result).to.have.property('rid')
      expect(result).to.have.property('comment')
    })
    it('requests a Livechat transcript', async () => {
      const result = await livechatApi.requestTranscript(email, { rid })
      expect('Content-Type', 'application/json')
      expect(200)
      expect(result).to.have.property('success', true)
      expect(result).to.have.property('message')
    })
  })
  describe('.agents', () => {
    it('returns data of a given Livechat room', async () => {
      const result = await livechatApi.agent({ rid })
      expect('Content-Type', 'application/json')
      expect(200)
      expect(result).to.have.property('success', true)
      expect(result).to.have.property('agent')
      expect(result.agent).to.have.property('emails')
      expect(result.agent).to.have.property('name')
      expect(result.agent).to.have.property('username')
    })
    it('returns the data of the next Livechat agent available', async () => {
      const result = await livechatApi.nextAgent({ department })
      expect('Content-Type', 'application/json')
      expect(200)
      expect(result).to.have.property('success', true)
      expect(result).to.have.property('agent')
      expect(result.agent).to.have.property('emails')
      expect(result.agent).to.have.property('name')
      expect(result.agent).to.have.property('username')
    })
  })
  describe('.messages', () => {
    it('sends a new Livechat message', async () => {
      const result = await livechatApi.sendMessage(newMessage)
      expect('Content-Type', 'application/json')
      expect(200)
      expect(result).to.have.property('success', true)
      expect(result).to.have.property('message')
      expect(result.message).to.have.property('_id')
      expect(result.message).to.have.property('msg')
      expect(result.message).to.have.property('u')
    })
    it.skip('edit a Livechat Message', async () => {
      const msg = await livechatApi.sendMessage(newMessage)
      const _id = msg && msg.message && msg.message._id
      const result = await livechatApi.editMessage(_id, editMessage)
      expect('Content-Type', 'application/json')
      expect(200)
      expect(result).to.have.property('success', true)
      expect(result).to.have.property('message')
      expect(result.message).to.have.property('_id')
      expect(result.message).to.have.property('msg')
      expect(result.message).to.have.property('u')
    })
    it('retrieves a list of Livechat messages', async () => {
      const result = await livechatApi.loadMessages(rid)
      expect('Content-Type', 'application/json')
      expect(200)
      expect(result).to.have.property('success', true)
      expect(result).to.have.property('messages')
      const messages = result.messages.map((msg: IMessage) => msg.rid)
      expect(messages).to.include(rid)
    })
    it.skip('deletes a Livechat message', async () => {
      const msg = await livechatApi.sendMessage(newMessage)
      const _id = msg && msg.message && msg.message._id
      const result = await livechatApi.deleteMessage(_id, { rid })
      expect('Content-Type', 'application/json')
      expect(200)
      expect(result).to.have.property('success', true)
      expect(result).to.have.property('message')
      expect(result.message).to.have.property('_id')
      expect(result.message._id).to.equal(_id)
    })
    it.skip('sends a Livechat offline message', async () => {
      const result = await livechatApi.sendOfflineMessage(mockOfflineMessage)
      expect('Content-Type', 'application/json')
      expect(200)
      expect(result).to.have.property('success', true)
      expect(result).to.have.property('message')
    })
    it('sends a Livechat visitor navigation history', async () => {
      const result = await livechatApi.sendVisitorNavigation({ rid }, pageInfo)
      expect('Content-Type', 'application/json')
      expect(200)
      expect(result).to.have.property('success', true)
      expect(result).to.have.property('page')
      expect(result.page).to.have.property('msg')
      expect(result.page).to.have.property('navigation')
      expect(result.page.navigation).to.have.property('token')
    })
  })
  describe('.visitors', () => {
    it('registers and grants access to a Livechat visitor', async () => {
      const visitor = await livechatApi.grantVisitor(mockVisitor)
      expect('Content-Type', 'application/json')
      expect(200)
      expect(visitor).to.have.property('token')
    })
    it.skip('assigns a customField to a Livechat visitor', async () => {
      const result = await livechatApi.sendCustomField(mockCustomField)
      expect('Content-Type', 'application/json')
      expect(200)
      expect(result).to.have.property('success', true)
      expect(result).to.have.property('field')
      expect(result.field).to.have.property('key')
      expect(result.field.key).to.equal(mockCustomField.key)
      expect(result.field).to.have.property('value')
      expect(result.field.value).to.equal(mockCustomField.value)
    })
    it.skip('assigns an array of customFields to a Livechat visitor', async () => {
      const result = await livechatApi.sendCustomFields(mockCustomFields)
      expect('Content-Type', 'application/json')
      expect(200)
      expect(result).to.have.property('success', true)
      expect(result).to.have.property('fields')
    })
  })
})
