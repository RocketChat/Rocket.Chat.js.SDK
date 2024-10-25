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
    before(async () => {
      await driver.login({ username: settings.username, password: settings.password })
    })
    it('logs in with the default user without arguments', async () => {
      const login = await clientApi.login({ username: settings.username, password: settings.password })
      expect(login.userId).to.equal(clientApi.userId)
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
      expect(clientApi.currentLogin).to.eql(null)
    })
  })

})
