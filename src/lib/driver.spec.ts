import 'mocha'
import sinon from 'sinon'
import { expect } from 'chai'
import { silence } from './log'
import { botUser, mockUser, apiUser } from '../utils/config'
import * as api from './api'
import * as utils from '../utils/testing'
import * as driver from './driver'
import * as methodCache from './methodCache'

const delay = (ms) => new Promise((resolve, reject) => setTimeout(resolve, ms))
let clock
let tId
let pId
const tName = utils.testChannelName
const pName = utils.testPrivateName

silence() // suppress log during tests (disable this while developing tests)

describe('driver', () => {
  before(async () => {
    const testChannel = await utils.channelInfo({ roomName: tName })
    tId = testChannel.channel._id
    const testPrivate = await utils.privateInfo({ roomName: pName })
    pId = testPrivate.group._id
  })
  after(async () => {
    await api.logout()
    await driver.logout()
    await driver.disconnect()
  })

  describe('.connect', () => {
    context('with localhost connection', () => {
      it('without args, returns a promise', () => {
        const promise = driver.connect()
        expect(promise.then).to.be.a('function')
        promise.catch((err) => console.error(err))
        return promise
      })
      it('accepts an error-first callback, providing asteroid', (done) => {
        driver.connect({}, (err, asteroid) => {
          expect(err).to.equal(null)
          expect(asteroid).to.be.an('object')
          done()
        })
      })
      it('without url takes localhost as default', (done) => {
        driver.connect({}, (err, asteroid) => {
          expect(err).to.eql(null)
          // const connectionHost = asteroid.endpoint
          const connectionHost = asteroid._host
          expect(connectionHost).to.contain('localhost:3000')
          done()
        })
      })
      it('promise resolves with asteroid in successful state', () => {
        return driver.connect({}).then((asteroid) => {
          const isActive = (asteroid.ddp.readyState === 1)
          // const isActive = asteroid.ddp.status === 'connected'
          expect(isActive).to.equal(true)
        })
      })
      it('provides the asteroid instance to method cache', () => {
        return driver.connect().then((asteroid) => {
          expect(methodCache.instance).to.eql(asteroid)
        })
      })
    })
    context('with timeout, on expiry', () => {
      before(() => clock = sinon.useFakeTimers(0))
      after(() => clock.restore())
      it('with url, attempts connection at URL', (done) => {
        driver.connect({ host: 'localhost:9999', timeout: 100 }, (err, asteroid) => {
          expect(err).to.be.an('error')
          const connectionHost = asteroid.endpoint || asteroid._host
          expect(connectionHost).to.contain('localhost:9999')
          done()
        })
        clock.tick(200)
      })
      it('returns error', (done) => {
        let opts = { host: 'localhost:9999', timeout: 100 }
        driver.connect(opts, (err, asteroid) => {
          const isActive = (asteroid.ddp.readyState === 1)
          expect(err).to.be.an('error')
          expect(isActive).to.eql(false)
          done()
        })
        clock.tick(200)
      })
      it('without callback, triggers promise catch', () => {
        const promise = driver.connect({ host: 'localhost:9999', timeout: 100 })
        .catch((err) => expect(err).to.be.an('error'))
        clock.tick(200)
        return promise
      })
      it('with callback, provides error to callback', (done) => {
        driver.connect({ host: 'localhost:9999', timeout: 100 }, (err) => {
          expect(err).to.be.an('error')
          done()
        })
        clock.tick(200)
      })
    })
  })

  // describe('disconnect', () => {
    // Disabled for now, as only Asteroid v2 has a disconnect method
    // it('disconnects from asteroid', async () => {
    //   await driver.connect()
    //   const asteroid = await driver.connect()
    //   await driver.disconnect()
    //   const isActive = asteroid.ddp.readyState === 1
    //   // const isActive = asteroid.ddp.status === 'connected'
    //   expect(isActive).to.equal(false)
    // })
  // })
  describe('.login', () => {
    it('sets the bot user status to online', async () => {
      await driver.connect()
      await driver.login()
      await utils
      const result = await utils.userInfo(botUser.username)
      expect(result.user.status).to.equal('online')
    })
  })
  describe('.subscribeToMessages', () => {
    it('resolves with subscription object', async () => {
      await driver.connect()
      await driver.login()
      const subscription = await driver.subscribeToMessages()
      expect(subscription).to.have.property('ready')
      // expect(subscription.ready).to.have.property('state', 'fulfilled') ????
    })
  })
  describe('.reactToMessages', () => {
    afterEach(() => delay(500)) // avoid rate limit
    it('calls callback on every subscription update', async () => {
      await driver.connect()
      await driver.login()
      await driver.subscribeToMessages()
      const callback = sinon.spy()
      driver.reactToMessages(callback)
      await utils.sendFromUser({ text: 'SDK test `reactToMessages` 1' })
      await delay(500)
      await utils.sendFromUser({ text: 'SDK test `reactToMessages` 2' })
      expect(callback.callCount).to.equal(2)
    })
    it('calls callback with sent message object', async () => {
      await driver.connect()
      await driver.login()
      await driver.subscribeToMessages()
      const callback = sinon.spy()
      driver.reactToMessages(callback)
      await utils.sendFromUser({ text: 'SDK test `reactToMessages` 3' })
      const messageArgs = callback.getCall(0).args[1]
      expect(messageArgs.msg).to.equal('SDK test `reactToMessages` 3')
    })
  })
  describe('.sendMessage', () => {
    before(async () => {
      await driver.connect()
      await driver.login()
    })
    it('sends a custom message', async () => {
      const message = driver.prepareMessage({
        rid: tId,
        msg: ':point_down:',
        emoji: ':point_right:',
        reactions: { ':thumbsup:': { usernames: [botUser.username] } },
        groupable: false
      })
      await driver.sendMessage(message)
      const last = (await utils.lastMessages(tId))[0]
      expect(last).to.have.deep.property('reactions', message.reactions)
      expect(last).to.have.property('emoji', ':point_right:')
      expect(last).to.have.property('msg', ':point_down:')
    })
    it('sends a message with actions', async () => {
      const attachments = [{
        actions: [
          { type: 'button', text: 'Action 1', msg: 'Testing Action 1', msg_in_chat_window: true },
          { type: 'button', text: 'Action 2', msg: 'Testing Action 2', msg_in_chat_window: true }
        ]
      }]
      await driver.sendMessage({
        rid: tId,
        msg: 'SDK test `prepareMessage` actions',
        attachments
      })
      const last = (await utils.lastMessages(tId))[0]
      delete last.attachments[0].ts;
      expect(last.attachments).to.eql(attachments)
    })
  })
  describe('.editMessage', () => {
    before(async () => {
      await driver.connect()
      await driver.login()
    })
    it('edits the last sent message', async () => {
      const original = driver.prepareMessage({
        msg: ':point_down:',
        emoji: ':point_right:',
        groupable: false,
        rid: tId
      })
      await driver.sendMessage(original)
      const sent = (await utils.lastMessages(tId))[0]
      const update = Object.assign({}, original, {
        _id: sent._id,
        msg: ':point_up:'
      })
      await driver.editMessage(update)
      const last = (await utils.lastMessages(tId))[0]
      expect(last).to.have.property('msg', ':point_up:')
      expect(last).to.have.deep.property('editedBy', {
        _id: driver.userId, username: botUser.username
      })
    })
  })
  describe('.setReaction', () => {
    before(async () => {
      await driver.connect()
      await driver.login()
    })
    it('adds emoji reaction to message', async () => {
      let sent = await driver.sendToRoomId('test reactions', tId)
      if (Array.isArray(sent)) sent = sent[0] // see todo on `sendToRoomId`
      await driver.setReaction(':thumbsup:', sent._id)
      const last = (await utils.lastMessages(tId))[0]
      expect(last.reactions).to.have.deep.property(':thumbsup:', {
        usernames: [ botUser.username ]
      })
    })
    it('removes if used when emoji reaction exists', async () => {
      const sent = await driver.sendMessage(driver.prepareMessage({
        msg: 'test reactions -',
        reactions: { ':thumbsup:': { usernames: [botUser.username] } },
        rid: tId
      }))
      await driver.setReaction(':thumbsup:', sent._id)
      const last = (await utils.lastMessages(tId))[0]
      expect(last).to.not.have.property('reactions')
    })
  })
  describe('.sendToRoomId', () => {
    it('sends string to the given room id', async () => {
      const result = await driver.sendToRoomId('SDK test `sendToRoomId`', tId)
      expect(result).to.include.all.keys(['msg', 'rid', '_id'])
    })
    it('sends array of strings to the given room id', async () => {
      const result = await driver.sendToRoomId([
        'SDK test `sendToRoomId` A',
        'SDK test `sendToRoomId` B'
      ], tId)
      expect(result).to.be.an('array')
      expect(result[0]).to.include.all.keys(['msg', 'rid', '_id'])
      expect(result[1]).to.include.all.keys(['msg', 'rid', '_id'])
    })
  })
  describe('.sendToRoom', () => {
    it('sends string to the given room name', async () => {
      await driver.connect()
      await driver.login()
      await driver.subscribeToMessages()
      const result = await driver.sendToRoom('SDK test `sendToRoom`', tName)
      expect(result).to.include.all.keys(['msg', 'rid', '_id'])
    })
    it('sends array of strings to the given room name', async () => {
      await driver.connect()
      await driver.login()
      await driver.subscribeToMessages()
      const result = await driver.sendToRoom([
        'SDK test `sendToRoom` A',
        'SDK test `sendToRoom` B'
      ], tName)
      expect(result).to.be.an('array')
      expect(result[0]).to.include.all.keys(['msg', 'rid', '_id'])
      expect(result[1]).to.include.all.keys(['msg', 'rid', '_id'])
    })
  })
  describe('.sendDirectToUser', () => {
    before(async () => {
      await driver.connect()
      await driver.login()
    })
    it('sends string to the given room name', async () => {
      await driver.connect()
      await driver.login()
      const result = await driver.sendDirectToUser('SDK test `sendDirectToUser`', mockUser.username)
      expect(result).to.include.all.keys(['msg', 'rid', '_id'])
    })
    it('sends array of strings to the given room name', async () => {
      const result = await driver.sendDirectToUser([
        'SDK test `sendDirectToUser` A',
        'SDK test `sendDirectToUser` B'
      ], mockUser.username)
      expect(result).to.be.an('array')
      expect(result[0]).to.include.all.keys(['msg', 'rid', '_id'])
      expect(result[1]).to.include.all.keys(['msg', 'rid', '_id'])
    })
  })
  describe('.respondToMessages', () => {
    beforeEach(async () => {
      await driver.connect()
      await driver.login()
      await driver.subscribeToMessages()
    })
    it('joins rooms if not already joined', async () => {
      expect(driver.joinedIds).to.have.lengthOf(0)
      await driver.respondToMessages(() => null, { rooms: ['general', tName] })
      expect(driver.joinedIds).to.have.lengthOf(2)
    })
    it('ignores messages sent from bot', async () => {
      const callback = sinon.spy()
      driver.respondToMessages(callback)
      await driver.sendToRoomId('SDK test `respondToMessages`', tId)
      sinon.assert.notCalled(callback)
    })
    it('fires callback on messages in joined rooms', async () => {
      const callback = sinon.spy()
      driver.respondToMessages(callback, { rooms: [tName] })
      await utils.sendFromUser({ text: 'SDK test `respondToMessages` 1' })
      sinon.assert.calledOnce(callback)
    })
    it('by default ignores edited messages', async () => {
      const callback = sinon.spy()
      const sentMessage = await utils.sendFromUser({
        text: 'SDK test `respondToMessages` sent'
      })
      driver.respondToMessages(callback, { rooms: [tName] })
      await utils.updateFromUser({
        roomId: tId,
        msgId: sentMessage.message._id,
        text: 'SDK test `respondToMessages` edited'
      })
      sinon.assert.notCalled(callback)
    })
    it('ignores edited messages, after receiving original', async () => {
      const callback = sinon.spy()
      driver.respondToMessages(callback, { rooms: [tName] })
      const sentMessage = await utils.sendFromUser({
        text: 'SDK test `respondToMessages` sent'
      })
      await utils.updateFromUser({
        roomId: tId,
        msgId: sentMessage.message._id,
        text: 'SDK test `respondToMessages` edited'
      })
      sinon.assert.calledOnce(callback)
    })
    it('fires callback on edited message if configured', async () => {
      const callback = sinon.spy()
      const sentMessage = await utils.sendFromUser({
        text: 'SDK test `respondToMessages` sent'
      })
      driver.respondToMessages(callback, { edited: true, rooms: [tName] })
      await utils.updateFromUser({
        roomId: tId,
        msgId: sentMessage.message._id,
        text: 'SDK test `respondToMessages` edited'
      })
      sinon.assert.calledOnce(callback)
    })
    it('by default ignores DMs', async () => {
      const dmResult = await utils.setupDirectFromUser()
      const callback = sinon.spy()
      driver.respondToMessages(callback, { rooms: [tName] })
      await utils.sendFromUser({
        text: 'SDK test `respondToMessages` DM',
        roomId: dmResult.room._id
      })
      sinon.assert.notCalled(callback)
    })
    it('fires callback on DMs if configured', async () => {
      const dmResult = await utils.setupDirectFromUser()
      const callback = sinon.spy()
      driver.respondToMessages(callback, { dm: true, rooms: [tName] })
      await utils.sendFromUser({
        text: 'SDK test `respondToMessages` DM',
        roomId: dmResult.room._id
      })
      sinon.assert.calledOnce(callback)
    })
    it('fires callback on ul (user leave) message types', async () => {
      const callback = sinon.spy()
      driver.respondToMessages(callback, { rooms: [tName] })
      await utils.leaveUser()
      sinon.assert.calledWithMatch(callback, null, sinon.match({ t: 'ul' }))
      await utils.inviteUser()
    })
    it('fires callback on au (user added) message types', async () => {
      await utils.leaveUser()
      const callback = sinon.spy()
      driver.respondToMessages(callback, { rooms: [tName] })
      await utils.inviteUser()
      sinon.assert.calledWithMatch(callback, null, sinon.match({ t: 'au' }))
    })
    // it('appends room name to event meta in channels', async () => {
    //   const callback = sinon.spy()
    //   driver.respondToMessages(callback, { dm: true, rooms: [tName] })
    //   await utils.sendFromUser({ text: 'SDK test `respondToMessages` DM' })
    //   expect(callback.firstCall.args[2].roomName).to.equal(tName)
    // })
    // it('room name is undefined in direct messages', async () => {
    //   const dmResult = await utils.setupDirectFromUser()
    //   const callback = sinon.spy()
    //   driver.respondToMessages(callback, { dm: true, rooms: [tName] })
    //   await utils.sendFromUser({
    //     text: 'SDK test `respondToMessages` DM',
    //     roomId: dmResult.room._id
    //   })
    //   expect(callback.firstCall.args[2].roomName).to.equal(undefined)
    // })
  })
  describe('.getRoomId', () => {
    beforeEach(async () => {
      await driver.connect()
      await driver.login()
    })
    it('returns the ID for a channel by ID', async () => {
      const room = await driver.getRoomId(tName)
      expect(room).to.equal(tId)
    })
    it('returns the ID for a private room name', async () => {
      const room = await driver.getRoomId(pName)
      expect(room).to.equal(pId)
    })
  })
  describe('.getRoomName', () => {
    beforeEach(async () => {
      await driver.connect()
      await driver.login()
    })
    it('returns the name for a channel by ID', async () => {
      const room = await driver.getRoomName(tId)
      expect(room).to.equal(tName)
    })
    it('returns the name for a private group by ID', async () => {
      const room = await driver.getRoomName(pId)
      expect(room).to.equal(pName)
    })
    it('returns undefined for a DM room', async () => {
      const dmResult = await utils.setupDirectFromUser()
      const room = await driver.getRoomName(dmResult.room._id)
      expect(room).to.equal(undefined)
    })
  })
  describe('.joinRooms', () => {
    it('joins all the rooms in array, keeping IDs', async () => {
      driver.joinedIds.splice(0, driver.joinedIds.length) // clear const array
      await driver.connect()
      await driver.login()
      await driver.joinRooms(['general', tName])
      expect(driver.joinedIds).to.have.members(['GENERAL', tId])
    })
  })
  describe('execSlashCommand', () => {
    it('execute slash command', async () => {
        await driver.connect()
        await driver.login()
        const result = await driver.execSlashCommand({ cmd: 'shrug', params: '', msg: { rid: tId, msg: '' } });
        expect(result).to.equal(undefined)
    })
  })
})
