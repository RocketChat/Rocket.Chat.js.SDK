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
import BotDriver from '../drivers/BotDriver'
import ClientApi from './Client'
import LivechatApi from './Livechat'
import * as settings from '../settings'
import { IMessage } from '../../interfaces'

silence() // suppress log during tests (disable this while developing tests)

const clientApi = new ClientApi({})
const livechatApi = new LivechatApi({})
const driver = new BotDriver({})

// livechat data, to be populated in before hooks
let token = settings.token
let department = settings.department
let room: any
let rid: any
let newMessage: any
let editMessage: any
let pageInfo: any
let email = 'sample@rocket.chat'

describe('clientApi', () => {
  after(() => process.env = initEnv)
  afterEach(() => clientApi.logout())
  describe('.success', () => {
    it('returns true when result status is 200', () => {
      expect(clientApi.success({ status: 200 })).to.equal(true)
    })
    it('returns true when success is 300', () => {
      expect(clientApi.success({ status: 300 })).to.equal(true)
    })
    it('returns false when result status is 400', () => {
      expect(clientApi.success({ status: 401 })).to.equal(false)
    })
    it('returns false when success is 500', () => {
      expect(clientApi.success({ status: 500 })).to.equal(false)
    })
    it('returns true if status is not given', () => {
      expect(clientApi.success({})).to.equal(true)
    })
  })
  describe('.get', () => {
    before(() => clientApi.login({ username: settings.username, password: settings.password }))
    it('returns data from basic call without auth', async () => {
      const server = await clientApi.info()
      const result = await clientApi.get('info', {}, false)
      expect(result).to.eql({
        info: { version: server.version },
        success: true
      })
    })
    it('returns data from complex calls with auth and parameters', async () => {
      await clientApi.login({ username: settings.username, password: settings.password })
      const result = await clientApi.get('users.list', {
        fields: { 'username': 1 },
        query: { username: botUser.username, type: { $in: ['user', 'bot'] } }
      }, true)
      const users = result.users.map((user: any) => user.username)
      expect(users).to.include(botUser.username, mockUser.username)
    })
    after(() => driver.logout())
  })
  describe('.login', () => {
    before(() => driver.login({ username: settings.username, password: settings.password }))
    it('logs in with the default user without arguments', async () => {
      const login = await clientApi.login({ username: settings.username, password: settings.password })
      expect(login.data.userId).to.equal(driver.userId)
    })
    it('logs in with another user if given credentials', async () => {
      await clientApi.login({
        username: mockUser.username,
        password: mockUser.password
      })
      const mockInfo = await clientApi.get('users.info', { username: mockUser.username })
      expect(clientApi.currentLogin && clientApi.currentLogin.userId).to.equal(mockInfo.user._id)
    })
    it('stores logged in user result', async () => {
      await clientApi.login({ username: settings.username, password: settings.password })
      expect(clientApi.currentLogin && clientApi.currentLogin.userId).to.equal(driver.userId)
    })
    after(() => driver.logout())
  })
  describe('.logout', () => {
    it('resets auth headers and clears user ID', async () => {
      await clientApi.login({ username: settings.username, password: settings.password }).catch(e => console.log('login error', e))
      await clientApi.logout().catch(e => console.log('logout error', e))
      expect(clientApi.currentLogin && clientApi.currentLogin).to.eql(null)
    })
  })

  describe('.livechat', () => {
    before(async () => {
      if (token === '') {
        const { visitor } = await livechatApi.grantVisitor(mockVisitor)
        token = visitor && visitor.token
      }
      const result = await livechatApi.room({ token })
      room = result.room
      rid = room && room._id
      newMessage = { token, rid, msg: 'sending livechat message...' }
      editMessage = { token, rid, msg: 'editing livechat message...' }
      pageInfo = Object.assign({}, mockVisitorNavigation, { rid })
    })
    describe('.config', () => {
      it('returns data from basic Livechat initial config', async () => {
        const result = await livechatApi.config({ token })
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
      it('requests a Livechat transfer', async () => {
        const result = await livechatApi.transferChat({ rid, token, department })
        expect('Content-Type', 'application/json')
        expect(200)
        expect(result).to.have.property('success', true)
        expect(result).to.have.property('room')
        expect(result.room).to.have.property('servedBy')
        expect(result.room).to.have.property('open')
        expect(result.room).to.have.property('departmentId')
      })
      it('sends a Livechat survey', async () => {
        const result = await livechatApi.chatSurvey({ rid, token, data: mockSurvey })
        expect('Content-Type', 'application/json')
        expect(200)
        expect(result).to.have.property('success', true)
        expect(result).to.have.property('rid')
        expect(result).to.have.property('data')
      })
      it('requests a Livechat video call', async () => {
        const result = await livechatApi.videoCall({ rid, token })
        expect('Content-Type', 'application/json')
        expect(200)
        expect(result).to.have.property('success', true)
        expect(result).to.have.property('videoCall')
      })
      it('close a Livechat room', async () => {
        const result = await livechatApi.closeChat({ rid, token })
        expect('Content-Type', 'application/json')
        expect(200)
        expect(result).to.have.property('success', true)
        expect(result).to.have.property('rid')
        expect(result).to.have.property('comment')
      })
      it('requests a Livechat transcript', async () => {
        const result = await livechatApi.requestTranscript(email, { rid, token })
        expect('Content-Type', 'application/json')
        expect(200)
        expect(result).to.have.property('success', true)
        expect(result).to.have.property('message')
      })
    })
    describe('.agents', () => {
      it('returns data of a given Livechat room', async () => {
        const result = await livechatApi.agent({ rid, token })
        expect('Content-Type', 'application/json')
        expect(200)
        expect(result).to.have.property('success', true)
        expect(result).to.have.property('agent')
        expect(result.agent).to.have.property('emails')
        expect(result.agent).to.have.property('name')
        expect(result.agent).to.have.property('username')
      })
      it('returns the data of the next Livechat agent available', async () => {
        const result = await livechatApi.nextAgent({ token, department })
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
      it('edit a Livechat Message', async () => {
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
        const result = await livechatApi.loadMessages(rid, { token })
        expect('Content-Type', 'application/json')
        expect(200)
        expect(result).to.have.property('success', true)
        expect(result).to.have.property('messages')
        const messages = result.messages.map((msg: IMessage) => msg.rid)
        expect(messages).to.include(rid)
      })
      it('deletes a Livechat message', async () => {
        const msg = await livechatApi.sendMessage(newMessage)
        const _id = msg && msg.message && msg.message._id
        const result = await livechatApi.deleteMessage(_id, { token, rid })
        expect('Content-Type', 'application/json')
        expect(200)
        expect(result).to.have.property('success', true)
        expect(result).to.have.property('message')
        expect(result.message).to.have.property('_id')
        expect(result.message._id).to.equal(_id)
      })
      it('sends a Livechat offline message', async () => {
        const result = await livechatApi.sendOfflineMessage(mockOfflineMessage)
        expect('Content-Type', 'application/json')
        expect(200)
        expect(result).to.have.property('success', true)
        expect(result).to.have.property('message')
      })
      it('sends a Livechat visitor navigation history', async () => {
        const result = await livechatApi.sendVisitorNavigation({ token, rid }, pageInfo)
        expect('Content-Type', 'application/json')
        expect(200)
        expect(result).to.have.property('success', true)
        expect(result).to.have.property('page')
        expect(result.page).to.have.property('msg')
        expect(result.page).to.have.property('navigation')
        expect(result.page.navigation).to.have.property('token')
        expect(result.page.navigation.token).to.equal(token)
      })
    })
    describe('.visitors', () => {
      it('registers and grants access to a Livechat visitor', async () => {
        const result = await livechatApi.grantVisitor(mockVisitor)
        expect('Content-Type', 'application/json')
        expect(200)
        expect(result).to.have.property('success', true)
        expect(result).to.have.property('visitor')
        expect(result.visitor).to.have.property('token')
        expect(result.visitor.token).to.equal(token)
      })
      it('assigns a customField to a Livechat visitor', async () => {
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
      it('assigns an array of customFields to a Livechat visitor', async () => {
        const result = await livechatApi.sendCustomFields(mockCustomFields)
        expect('Content-Type', 'application/json')
        expect(200)
        expect(result).to.have.property('success', true)
        expect(result).to.have.property('fields')
      })
    })
  })
})
