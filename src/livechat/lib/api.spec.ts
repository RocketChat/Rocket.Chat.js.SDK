import 'mocha'
import { expect } from 'chai'
import { silence, logger } from '../../lib/log'
import { mockVisitor, mockSurvey, mockVisitorNavigation, mockOfflineMessage, mockCustomField, mockCustomFields } from '../lib/mock'
import * as api from './api'
import * as settings from '../lib/settings'

silence() // suppress log during tests (disable this while developing tests)

async function getVisitorToken() {
  let { token } = settings
  if (!token || token === '') {
    const { visitor } = await api.livechat.grantVisitor(mockVisitor)
    token = visitor && visitor.token
  }

  return token
}

async function getRoom(token: string) {
  const { room } = await api.livechat.room({ token })
  return room
}

describe('livechat api', () => {
  describe('config', () => {
    it('returns data from basic Livechat initial config', async () => {
      const result = await api.livechat.config()
      expect(200)
      expect(result).to.have.property('success', true)
      expect(result).to.have.property('config')
      expect(result.config).to.have.property('enabled')
      expect(result.config).to.have.property('settings')
      expect(result.config).to.have.property('theme')
      expect(result.config).to.have.property('messages')
      expect(result.config).to.have.property('survey')
    })
    it('returns data from Livechat config with a valid token', async () => {
      const { token } = mockVisitor.visitor
      const result = await api.livechat.config({ token })
      expect(200)
      expect(result).to.have.property('success', true)
      expect(result).to.have.property('config')
      expect(result.config).to.have.property('enabled')
      expect(result.config).to.have.property('settings')
      expect(result.config).to.have.property('theme')
      expect(result.config).to.have.property('messages')
      expect(result.config).to.have.property('survey')
      expect(result.config).to.have.property('guest')
      expect(result.config).to.have.property('room')
      expect(result.config).to.have.property('agent')
    })
  })
  describe('rooms', () => {
    let room
    let token
    let department
    let rid
    let email = 'sample@rocket.chat'
    before(async () => {
      token = await getVisitorToken()
      room = await getRoom(token)
      department = settings.deparmentId
      rid = room && room._id
    })
    it('requests a Livechat transfer', async () => {
      const result = await api.livechat.transferChat({ rid, token, department })
      expect('Content-Type', 'application/json')
      expect(200)
      expect(result).to.have.property('success', true)
      expect(result).to.have.property('room')
      expect(result.room).to.have.property('servedBy')
      expect(result.room).to.have.property('open')
      expect(result.room).to.have.property('departmentId')
    })
    it('sends a Livechat survey', async () => {
      const result = await api.livechat.chatSurvey({ rid, token, data: mockSurvey })
      expect('Content-Type', 'application/json')
      expect(200)
      expect(result).to.have.property('success', true)
      expect(result).to.have.property('rid')
      expect(result).to.have.property('data')
    })
    it('requests a Livechat video call', async () => {
      const result = await api.livechat.videoCall({ rid, token })
      expect('Content-Type', 'application/json')
      expect(200)
      expect(result).to.have.property('success', true)
      expect(result).to.have.property('videoCall')
    })
    it('close a Livechat room', async () => {
      const result = await api.livechat.closeChat({ rid, token })
      expect('Content-Type', 'application/json')
      expect(200)
      expect(result).to.have.property('success', true)
      expect(result).to.have.property('rid')
      expect(result).to.have.property('comment')
    })
    it('requests a Livechat transcript', async () => {
      const result = await api.livechat.requestTranscript(email, { rid, token })
      expect('Content-Type', 'application/json')
      expect(200)
      expect(result).to.have.property('success', true)
      expect(result).to.have.property('message')
    })
  })
  describe('agents', () => {
    let room
    let token
    let department
    let rid
    before(async () => {
      token = await getVisitorToken()
      room = await getRoom(token)
      department = settings.deparmentId
      rid = room && room._id
    })
    it('returns data of a given Livechat room', async () => {
      const result = await api.livechat.agent({ rid, token })
      expect('Content-Type', 'application/json')
      expect(200)
      expect(result).to.have.property('success', true)
      expect(result).to.have.property('agent')
      expect(result.agent).to.have.property('emails')
      expect(result.agent).to.have.property('name')
      expect(result.agent).to.have.property('username')
    })
    it('returns the data of the next Livechat agent available', async () => {
      const result = await api.livechat.nextAgent({ token, department })
      expect('Content-Type', 'application/json')
      expect(200)
      expect(result).to.have.property('success', true)
      expect(result).to.have.property('agent')
      expect(result.agent).to.have.property('emails')
      expect(result.agent).to.have.property('name')
      expect(result.agent).to.have.property('username')
    })
  })
  describe('messages', () => {
    let room
    let token
    let department
    let rid
    let newMessage
    let editMessage
    let pageInfo

    before(async () => {
      token = await getVisitorToken()
      room = await getRoom(token)
      rid = room && room._id

      newMessage = {
        token,
        rid,
        msg: 'sending livechat message..'
      }

      editMessage = {
        token,
        rid,
        msg: 'editing livechat message..'
      }

      pageInfo = Object.assign({}, mockVisitorNavigation, { rid })

    })
    it('sends a new Livechat message', async () => {
      const result = await api.livechat.sendMessage(newMessage)
      expect('Content-Type', 'application/json')
      expect(200)
      expect(result).to.have.property('success', true)
      expect(result).to.have.property('message')
      expect(result.message).to.have.property('_id')
      expect(result.message).to.have.property('msg')
      expect(result.message).to.have.property('u')
    })
    it('edit a Livechat Message', async () => {
      const msg = await api.livechat.sendMessage(newMessage)
      const _id = msg && msg.message && msg.message._id
      const result = await api.livechat.editMessage(_id, editMessage)
      expect('Content-Type', 'application/json')
      expect(200)
      expect(result).to.have.property('success', true)
      expect(result).to.have.property('message')
      expect(result.message).to.have.property('_id')
      expect(result.message).to.have.property('msg')
      expect(result.message).to.have.property('u')
    })
    it('retrieves a list of Livechat messages', async () => {
      const result = await api.livechat.loadMessages(rid, { token })
      expect('Content-Type', 'application/json')
      expect(200)
      expect(result).to.have.property('success', true)
      expect(result).to.have.property('messages')
      const messages = result.messages.map((msg) => msg.rid)
      expect(messages).to.include(rid)

    })
    it('deletes a Livechat message', async () => {
      const msg = await api.livechat.sendMessage(newMessage)
      const _id = msg && msg.message && msg.message._id
      const result = await api.livechat.deleteMessage(_id, { token, rid })
      expect('Content-Type', 'application/json')
      expect(200)
      expect(result).to.have.property('success', true)
      expect(result).to.have.property('message')
      expect(result.message).to.have.property('_id')
      expect(result.message._id).to.equal(_id)
    })
    it('sends a Livechat offline message', async () => {
      const result = await api.livechat.sendOfflineMessage(mockOfflineMessage)
      expect('Content-Type', 'application/json')
      expect(200)
      expect(result).to.have.property('success', true)
      expect(result).to.have.property('message')
    })
    it('sends a Livechat visitor navigation history', async () => {
      const result = await api.livechat.sendVisitorNavigation({ token, rid }, pageInfo)
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
  describe('visitor', () => {
    let room
    let token
    let department
    let rid
    before(async () => {
      token = await getVisitorToken()
      room = await getRoom(token)
      department = settings.deparmentId
      rid = room && room._id
    })
    it('registers and grants access to a Livechat visitor', async () => {
      const result = await api.livechat.grantVisitor(mockVisitor)
      expect('Content-Type', 'application/json')
      expect(200)
      expect(result).to.have.property('success', true)
      expect(result).to.have.property('visitor')
      expect(result.visitor).to.have.property('token')
      expect(result.visitor.token).to.equal(token)
    })
    it('assigns a customField to a Livechat visitor', async () => {
      const result = await api.livechat.sendCustomField(mockCustomField)
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
      const result = await api.livechat.sendCustomFields(mockCustomFields)
      expect('Content-Type', 'application/json')
      expect(200)
      expect(result).to.have.property('success', true)
      expect(result).to.have.property('fields')
    })
  })
})
