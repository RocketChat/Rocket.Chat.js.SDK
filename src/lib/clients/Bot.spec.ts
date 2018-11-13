import 'mocha'
import { apiUser, botUser, mockUser } from '../../utils/config'
import sinon from 'sinon'
import { expect } from 'chai'
import { silence } from '../log'
import * as settings from '../settings'
import { testChannelName, testPrivateName } from '../../utils/testing'
import BotDriver from './Bot'
import { ISocketOptions, IMessageReceipt, ILogger } from '../../interfaces'

import { Socket } from '../drivers/ddp'
global.fetch = require('node-fetch-polyfill')

const delay = (ms: number) => new Promise((resolve, reject) => setTimeout(resolve, ms))
let clock: any
let PUBLIC_ROOM: string
let PRIVATE_ROOM: string
class L implements ILogger {
  debug (...args: any[]) {
    // console.log(...args)
  }
  info (...args: any[]) {
    // console.log(...args)
  }
  warning (...args: any[]) {
    // console.warn(...args)
  }
  warn (...args: any[]) { // legacy method
    // return this.warning(...args)
  }
  error (...args: any[]) {
    // console.error(...args)
  }
}
const mockuser = new BotDriver({})
const botuser = new BotDriver({ logger : new L() })
const adminuser = new BotDriver({})

const getLastmessage = async () => {
  return (await adminuser.loadHistory(PUBLIC_ROOM, new Date(new Date().setMinutes(new Date().getMinutes() - 10)))).updated[0]
}
describe('Bot Driver', () => {
  before(async () => {
    try {
      await Promise.all([
        mockuser.login({ password: mockUser.password, username: mockUser.username }),
        adminuser.login({ password: apiUser.password, username: apiUser.username })
      ])
      await botuser.login({ password: botUser.password, username: botUser.username })
      const testChannel = await adminuser.channelInfo({ roomName: testChannelName })
      PUBLIC_ROOM = testChannel._id
      const testPrivate = await adminuser.privateInfo({ roomName: testPrivateName })
      PRIVATE_ROOM = testPrivate._id
    } catch (e) { console.log(e) }
  })
  after(async () => {
    await Promise.all([
      mockuser.logout(),
      botuser.logout(),
      adminuser.logout()
    ])
  })

  describe('.reactToMessages', () => {
    afterEach(() => {
      botuser.unsubscribeAll()
    })
    it('calls callback on every subscription update', async () => {
      const callback = sinon.spy()
      botuser.reactToMessages(callback)
      await adminuser.sendMessage('SDK test `reactToMessages` 1', PUBLIC_ROOM)
      await delay(100)
      await adminuser.sendMessage('SDK test `reactToMessages` 2', PUBLIC_ROOM)
      await delay(100)
      expect(callback.callCount).to.equal(2)
    })
    it('calls callback with sent message object', async () => {
      const callback = sinon.spy()
      await botuser.reactToMessages(callback)
      await adminuser.sendMessage('SDK test `reactToMessages` 3', PUBLIC_ROOM)
      await delay(300)
      const { args = [] } = callback.getCall(0) || {}
      const messageArgs = args[1]
      expect(messageArgs.msg).to.equal('SDK test `reactToMessages` 3')
    })
  })
  describe('.setupMethodCache', () => {
    // @todo needs better testing (maybe use `getServerInfo` as test call without requiring login/connect)
    // stub instance class to make sure it's only calling on instance first time, instead of hacky timers
    it('returns subsequent cached method results from cache', async () => {
      await botuser.login({ username: settings.username, password: settings.password }) // calls setupMethodCache with DDP once connected
      const now = Date.now()
      const liveId = await botuser.getRoomNameById('GENERAL')
      const after = Date.now()
      const cacheId = await botuser.getRoomNameById('GENERAL')
      const final = Date.now()
      const firstCall = after - now
      const cacheCall = final - after
      expect(liveId).to.equal(cacheId)
      expect(firstCall).to.be.gt(cacheCall)
      expect(cacheCall).to.be.lte(10)
    })
  })
  describe('.sendMessage', () => {
    it('sends a custom message', async () => {
      const reactions = { ':thumbsup:': { usernames: [botUser.username] } }
      await botuser.sendMessage({
        msg: ':point_down:',
        emoji: ':point_right:',
        reactions,
        groupable: false
      }, PUBLIC_ROOM)
      const lastmessage = await getLastmessage()

      expect(lastmessage).to.have.deep.property('reactions', reactions)
      expect(lastmessage).to.have.property('emoji', ':point_right:')
      expect(lastmessage).to.have.property('msg', ':point_down:')
    })
    it('sends a message with actions', async () => {

      const attachments = [{
        actions: [
          { type: 'button', text: 'Action 1', msg: 'Testing Action 1', msg_in_chat_window: true },
          { type: 'button', text: 'Action 2', msg: 'Testing Action 2', msg_in_chat_window: true }
        ]
      }]
      await botuser.sendMessage({
        msg: 'SDK test `prepareMessage` actions',
        attachments
      } as any, PUBLIC_ROOM)
      const lastmessage = await getLastmessage()
      expect(lastmessage.attachments && lastmessage.attachments[0].actions).to.eql(attachments[0].actions)
    })
  })
  describe('.editMessage', () => {
    it('edits the last sent message', async () => {
      const original = await botuser.sendMessage({
        msg: ':point_down:',
        emoji: ':point_right:',
        groupable: false
      }, PUBLIC_ROOM)
      const messageSent = await getLastmessage()
      const update = {
        ...original,
        _id: messageSent._id,
        msg: ':point_up:'
      }

      await delay(100)
      await botuser.editMessage(update as any)
      const edited = await getLastmessage()
      expect(edited).to.have.property('msg', ':point_up:')
      expect(edited).to.have.deep.property('editedBy', {
        _id: botuser.userId, username: botUser.username
      })
    })
  })
  describe('.sendToRoomId', () => {
    it('sends string to the given room id', async () => {
      const result = await botuser.sendToRoomId('SDK test `sendToRoomId`', PUBLIC_ROOM)
      expect(result).to.include.all.keys(['msg', 'rid', '_id'])
    })
    it('sends array of strings to the given room id', async () => {
      const result = await botuser.sendToRoomId([
        'SDK test `sendToRoomId` A',
        'SDK test `sendToRoomId` B'
      ], PUBLIC_ROOM) as IMessageReceipt[]
      expect(result).to.be.an('array')
      expect(result[0]).to.include.all.keys(['msg', 'rid', '_id'])
      expect(result[1]).to.include.all.keys(['msg', 'rid', '_id'])
    })
  })
  describe('.sendToRoom', () => {
    it('sends string to the given room name', async () => {
      const result = await botuser.sendToRoom('SDK test `sendToRoom`', testChannelName)
      expect(result).to.include.all.keys(['msg', 'rid', '_id'])
    })
    it('sends array of strings to the given room name', async () => {
      const result = await botuser.sendToRoom([
        'SDK test `sendToRoom` A',
        'SDK test `sendToRoom` B'
      ], testChannelName) as IMessageReceipt[]
      expect(result).to.be.an('array')
      expect(result[0]).to.include.all.keys(['msg', 'rid', '_id'])
      expect(result[1]).to.include.all.keys(['msg', 'rid', '_id'])
    })
  })
  describe('.sendDirectToUser', () => {
    it('sends string to the given room name', async () => {
      const result = await botuser.sendDirectToUser('SDK test `sendDirectToUser`', mockUser.username)
      expect(result).to.include.all.keys(['msg', 'rid', '_id'])
    })
    it('sends array of strings to the given room name', async () => {
      const result = await botuser.sendDirectToUser([
        'SDK test `sendDirectToUser` A',
        'SDK test `sendDirectToUser` B'
      ], mockUser.username) as IMessageReceipt[]
      expect(result).to.be.an('array')
      expect(result[0]).to.include.all.keys(['msg', 'rid', '_id'])
      expect(result[1]).to.include.all.keys(['msg', 'rid', '_id'])
    })
  })
  describe('.setReaction', () => {
    it('adds emoji reaction to message', async () => {
      let sent = await botuser.sendToRoomId('test reactions', PUBLIC_ROOM)
      if (Array.isArray(sent)) sent = sent[0] // see todo on `sendToRoomId`
      await botuser.setReaction(':thumbsup:', sent._id)
      const lastmessage = await getLastmessage()
      expect(lastmessage.reactions).to.have.deep.property(':thumbsup:', {
        usernames: [ botUser.username ]
      })
    })
    it('removes if used when emoji reaction exists', async () => {
      const sent = await botuser.sendMessage({
        msg: 'test reactions -',
        reactions: { ':thumbsup:': { usernames: [botUser.username] } }
      } as any, PUBLIC_ROOM) as any
      await botuser.setReaction(':thumbsup:', sent._id)
      const lastmessage = await getLastmessage()
      expect(lastmessage).to.not.have.property('reactions')
    })
  })
  describe('.respondToMessages', () => {
    it('joins rooms if not already joined', async () => {
      expect(botuser.joinedIds).to.have.lengthOf(0)
      await botuser.respondToMessages(() => { return null }, { rooms: ['general', testChannelName] })
      expect(botuser.joinedIds).to.have.lengthOf(2)
    })
    it('ignores messages sent from bot', async () => {
      const callback = sinon.spy()
      botuser.respondToMessages(callback)
      await botuser.sendToRoomId('SDK test `respondToMessages`', PUBLIC_ROOM)
      await delay(300)
      sinon.assert.notCalled(callback)
    })
    it('fires callback on messages in joined rooms', async () => {
      const callback = sinon.spy()
      botuser.respondToMessages(callback, { rooms: [testChannelName] })
      await adminuser.sendMessage('SDK test `respondToMessages` 1', PUBLIC_ROOM)
      await delay(300)
      sinon.assert.calledOnce(callback)
    })
    it('by default ignores edited messages', async () => {
      const callback = sinon.spy()
      const sentMessage = await adminuser.sendMessage('SDK test `respondToMessages` sent', PUBLIC_ROOM)
      await delay(300)
      await botuser.respondToMessages(callback, { rooms: [testChannelName] })
      await adminuser.editMessage({
        rid: PUBLIC_ROOM,
        _id: sentMessage._id,
        msg: 'SDK test `respondToMessages` edited'
      } as any)
      await delay(300)
      sinon.assert.notCalled(callback)
    })
    it('ignores edited messages, after receiving original', async () => {
      const callback = sinon.spy()
      await botuser.respondToMessages(callback, { rooms: [testChannelName] })
      await delay(300)
      const sentMessage = await adminuser.sendMessage('SDK test `respondToMessages` sent', PUBLIC_ROOM)
      await delay(300)
      await adminuser.editMessage({
        rid: PUBLIC_ROOM,
        _id: sentMessage._id,
        msg: 'SDK test `respondToMessages` edited'
      } as any)

      await delay(300)
      sinon.assert.calledOnce(callback)
    })
    it('fires callback on edited message if configured', async () => {
      const callback = sinon.spy()
      const sentMessage = await adminuser.sendMessage('SDK test `respondToMessages` sent', PUBLIC_ROOM)
      await delay(300)
      await botuser.respondToMessages(callback, { edited: true, rooms: [testChannelName] })
      await delay(300)
      await adminuser.editMessage({
        rid: PUBLIC_ROOM,
        _id: sentMessage._id,
        msg: 'SDK test `respondToMessages` edited'
      } as any)

      await delay(300)
      sinon.assert.calledOnce(callback)
    })
    it('by default ignores DMs', async () => {
      const room = await adminuser.createDirectMessage(botUser.username)
      const callback = sinon.spy()
      await botuser.respondToMessages(callback, { rooms: [testChannelName] })
      await adminuser.sendMessage('SDK test `respondToMessages` DM', room._id)
      await delay(300)
      sinon.assert.notCalled(callback)
    })
    it('fires callback on DMs if configured', async () => {
      const room = await adminuser.createDirectMessage(botUser.username)
      const callback = sinon.spy()
      await botuser.respondToMessages(callback, { dm: true, rooms: [testChannelName] })
      await adminuser.sendMessage('SDK test `respondToMessages` DM', room._id)
      await delay(300)
      sinon.assert.calledOnce(callback)
    })
    // it.skip('fires callback on ul (user leave) message types', async () => {
    //   const callback = sinon.spy()
    //   botuser.respondToMessages(callback, { rooms: [testChannelName] })
    //   await utils.leaveUser()
    //   await(300)
    //   await utils.inviteUser()
    //   sinon.assert.calledWithMatch(callback, null, sinon.match({ t: 'ul' }))
    // })
    // it.skip('fires callback on au (user added) message types', async () => {
    //   const callback = sinon.spy()
    //   await utils.leaveUser()
    //   botuser.respondToMessages(callback, { rooms: [testChannelName] })
    //   await utils.inviteUser()
    //   await (300)
    //   sinon.assert.calledWithMatch(callback, null, sinon.match({ t: 'au' }))
    // })
    it.skip('appends room name to event meta in channels', async () => {
      const callback = sinon.spy()
      botuser.respondToMessages(callback, { dm: true, rooms: [testChannelName] })
      await adminuser.sendMessage('SDK test `respondToMessages` DM', PUBLIC_ROOM)
      await (300)
      expect(callback.firstCall.args[2].roomName).to.equal(testChannelName)
    })
    it('room name is undefined in direct messages', async () => {
      const room = await adminuser.createDirectMessage(botUser.username)
      const callback = sinon.spy()
      await new Promise(async resolve => {
        await botuser.respondToMessages((...args: any[]) => {
          resolve()
          callback(...args)
        }, { dm: true })
        adminuser.sendMessage('SDK test `respondToMessages` DM', room._id)
      })
      await (500)
      expect(callback.getCall(0).args[1].roomName).to.equal(undefined)
    })
  })
  describe('.getRoomId', () => {
    it('returns the ID for a channel by ID', async () => {
      const room = await botuser.getRoomId(testChannelName)
      expect(room).to.equal(PUBLIC_ROOM)
    })
    it('returns the ID for a private room name', async () => {
      const room = await botuser.getRoomId(testPrivateName)
      expect(room).to.equal(PRIVATE_ROOM)
    })
  })
  describe('.getRoomName', () => {
    it('returns the name for a channel by ID', async () => {
      const room = await botuser.getRoomName(PUBLIC_ROOM)
      expect(room).to.equal(testChannelName)
    })
    it('returns the name for a private group by ID', async () => {
      const room = await botuser.getRoomName(PRIVATE_ROOM)
      expect(room).to.equal(testPrivateName)
    })
    it('returns undefined for a DM room', async () => {
      const room = await adminuser.createDirectMessage(botUser.username)
      expect(await botuser.getRoomName(room._id)).to.equal(undefined)
    })
  })
  describe('.joinRooms', () => {
    it('joins all the rooms in array, keeping IDs', async () => {
      botuser.joinedIds.splice(0, botuser.joinedIds.length) // clear const array
      await botuser.joinRooms(['general', testChannelName])
      expect(botuser.joinedIds).to.have.members(['GENERAL', PUBLIC_ROOM])
    })
  })
})
