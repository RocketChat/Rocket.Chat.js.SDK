process.env.LOG_LEVEL = 'silent' // suppress API logs

import 'mocha'
import sinon from 'sinon'
import { expect } from 'chai'
import { silence } from './log'
import { botUser, mockUser } from '../utils/config'
import * as api from '../utils/api'
import * as utils from '../utils/testing'
import * as driver from './driver'
import * as methodCache from './methodCache'
const initEnv = process.env // store configs to reset after tests
const credentials = { username: botUser.username, password: botUser.password }
const delay = (ms) => new Promise((resolve, reject) => setTimeout(resolve, ms))
let clock

describe('driver', () => {
  silence() // suppress log during tests (disable this while developing tests)
  before(() => utils.setup()) // add user accounts for bot and mock user

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
      await driver.login(credentials)
      await utils
      await api.login(credentials)
      const result = await utils.userInfo(botUser.username)
      await api.logout()
      expect(result.user.status).to.equal('online')
    })
  })
  describe('.subscribeToMessages', () => {
    it('resolves with subscription object', async () => {
      await driver.connect()
      await driver.login(credentials)
      const subscription = await driver.subscribeToMessages()
      expect(subscription).to.have.property('ready')
      // expect(subscription.ready).to.have.property('state', 'fulfilled') ????
    })
  })
  describe('.reactToMessages', () => {
    afterEach(() => delay(500)) // avoid rate limit
    it('calls callback on every subscription update', async () => {
      await driver.connect()
      await driver.login(credentials)
      await driver.subscribeToMessages()
      const callback = sinon.spy()
      driver.reactToMessages(callback)
      await utils.sendFromUser({ text: 'SDK test `subscribeToMessages` 1' })
      await delay(500)
      await utils.sendFromUser({ text: 'SDK test `subscribeToMessages` 2' })
      expect(callback.callCount).to.equal(2)
    })
    it('calls callback with sent message object', async () => {
      await driver.connect()
      await driver.login(credentials)
      await driver.subscribeToMessages()
      const callback = sinon.spy()
      driver.reactToMessages(callback)
      await utils.sendFromUser({ text: 'SDK test `subscribeToMessages` 3' })
      const messageArgs = callback.getCall(0).args[1]
      expect(messageArgs.msg).to.equal('SDK test `subscribeToMessages` 3')
    })
  })
  describe('.sendToRoomId', () => {
    it('sends string to the given room id', async () => {
      await driver.connect()
      await driver.login(credentials)
      await driver.subscribeToMessages()
      const result = await driver.sendToRoomId('SDK test `sendToRoomId`', 'GENERAL')
      expect(result).to.include.all.keys(['msg', 'rid', '_id'])
    })
    it('sends array of strings to the given room id', async () => {
      await driver.connect()
      await driver.login(credentials)
      await driver.subscribeToMessages()
      const result = await driver.sendToRoomId([
        'SDK test `sendToRoomId` A',
        'SDK test `sendToRoomId` B'
      ], 'GENERAL')
      expect(result).to.be.an('array')
      expect(result[0]).to.include.all.keys(['msg', 'rid', '_id'])
      expect(result[1]).to.include.all.keys(['msg', 'rid', '_id'])
    })
  })
  describe('.sendToRoom', () => {
    it('sends string to the given room name', async () => {
      await driver.connect()
      await driver.login(credentials)
      await driver.subscribeToMessages()
      const result = await driver.sendToRoom('SDK test `sendToRoom`', 'general')
      expect(result).to.include.all.keys(['msg', 'rid', '_id'])
    })
    it('sends array of strings to the given room name', async () => {
      await driver.connect()
      await driver.login(credentials)
      await driver.subscribeToMessages()
      const result = await driver.sendToRoom([
        'SDK test `sendToRoom` A',
        'SDK test `sendToRoom` B'
      ], 'general')
      expect(result).to.be.an('array')
      expect(result[0]).to.include.all.keys(['msg', 'rid', '_id'])
      expect(result[1]).to.include.all.keys(['msg', 'rid', '_id'])
    })
  })
  describe('.sendDirectToUser', () => {
    it('sends string to the given room name', async () => {
      await driver.connect()
      await driver.login(credentials)
      await driver.subscribeToMessages()
      const result = await driver.sendDirectToUser('SDK test `sendDirectToUser`', mockUser.username)
      expect(result).to.include.all.keys(['msg', 'rid', '_id'])
    })
    it('sends array of strings to the given room name', async () => {
      await driver.connect()
      await driver.login(credentials)
      await driver.subscribeToMessages()
      const result = await driver.sendDirectToUser([
        'SDK test `sendDirectToUser` A',
        'SDK test `sendDirectToUser` B'
      ], mockUser.username)
      expect(result).to.be.an('array')
      expect(result[0]).to.include.all.keys(['msg', 'rid', '_id'])
      expect(result[1]).to.include.all.keys(['msg', 'rid', '_id'])
    })
  })
  describe('.connectDefaults', () => {
    beforeEach(() => {
      delete process.env.ROCKETCHAT_URL
      delete process.env.ROCKETCHAT_USE_SSL
    })
    afterEach(() => process.env = initEnv)
    it('uses localhost URL without SSL if env undefined', () => {
      const defaults = driver.connectDefaults()
      expect(defaults).to.eql({
        host: 'localhost:3000',
        useSsl: false,
        timeout: 20000
      })
    })
    it('sets SSL from env if defined', () => {
      process.env.ROCKETCHAT_USE_SSL = 'true'
      const defaults = driver.connectDefaults()
      expect(defaults.useSsl).to.equal(true)
    })
    it('uses SSL if https protocol URL in env', () => {
      process.env.ROCKETCHAT_URL = 'https://localhost:3000'
      const defaults = driver.connectDefaults()
      expect(defaults.useSsl).to.equal(true)
    })
    it('does not use SSL if http protocol URL in env', () => {
      process.env.ROCKETCHAT_URL = 'http://localhost:3000'
      const defaults = driver.connectDefaults()
      expect(defaults.useSsl).to.equal(false)
    })
    it('SSL overrides protocol detection', () => {
      process.env.ROCKETCHAT_URL = 'https://localhost:3000'
      process.env.ROCKETCHAT_USE_SSL = 'false'
      const defaults = driver.connectDefaults()
      expect(defaults.useSsl).to.equal(false)
    })
  })
  describe('.respondDefaults', () => {
    beforeEach(() => {
      delete process.env.ROCKETCHAT_ROOM
      delete process.env.LISTEN_ON_ALL_PUBLIC
      delete process.env.RESPOND_TO_DM
      delete process.env.RESPOND_TO_LIVECHAT
      delete process.env.RESPOND_TO_EDITED
    })
    afterEach(() => process.env = initEnv)
    it('all configs default to false if env undefined', () => {
      const defaults = driver.respondDefaults()
      expect(defaults).to.eql({
        rooms: [],
        allPublic: false,
        dm: false,
        livechat: false,
        edited: false
      })
    })
    it('inherits config from env defaults', () => {
      process.env.ROCKETCHAT_ROOM = 'GENERAL'
      process.env.LISTEN_ON_ALL_PUBLIC = 'false'
      process.env.RESPOND_TO_DM = 'true'
      process.env.RESPOND_TO_LIVECHAT = 'true'
      process.env.RESPOND_TO_EDITED = 'true'
      const defaults = driver.respondDefaults()
      expect(defaults).to.eql({
        rooms: ['GENERAL'],
        allPublic: false,
        dm: true,
        livechat: true,
        edited: true
      })
    })
    it('creates room array from csv list', () => {
      process.env.ROCKETCHAT_ROOM = 'general, tests'
      const defaults = driver.respondDefaults()
      expect(defaults.rooms).to.eql(['general', 'tests'])
    })
  })
  describe('.respondToMessages', () => {
    beforeEach(async () => {
      delete process.env.LISTEN_ON_ALL_PUBLIC
      delete process.env.RESPOND_TO_DM
      delete process.env.RESPOND_TO_LIVECHAT
      delete process.env.RESPOND_TO_EDITED
      await driver.connect()
      await driver.login(credentials)
      await driver.subscribeToMessages()
    })
    afterEach(() => process.env = initEnv)
    it('joins rooms if not already joined', async () => {
      expect(driver.joinedIds).to.have.lengthOf(0)
      const rooms = ['general', utils.testChannelName]
      await driver.respondToMessages(() => null, { rooms })
      expect(driver.joinedIds).to.have.lengthOf(2)
    })
    it('ignores messages sent from bot', async () => {
      const callback = sinon.spy()
      driver.respondToMessages(callback)
      await driver.sendToRoomId('SDK test `respondToMessages`', 'GENERAL')
      sinon.assert.notCalled(callback)
    })
    it('fires callback on messages in joined rooms', async () => {
      const callback = sinon.spy()
      driver.respondToMessages(callback)
      await utils.sendFromUser({ text: 'SDK test `respondToMessages` 1' })
      sinon.assert.calledOnce(callback)
    })
    it('by default ignores edited messages', async () => {
      const callback = sinon.spy()
      const sentMessage = await utils.sendFromUser({ text: 'SDK test `respondToMessages` sent' })
      driver.respondToMessages(callback)
      const updated = await utils.updateFromUser({
        roomId: 'GENERAL',
        msgId: sentMessage.message._id,
        text: 'SDK test `respondToMessages` edited'
      })
      sinon.assert.notCalled(callback)
    })
    it('fires callback on edited message if configured', async () => {
      const callback = sinon.spy()
      const sentMessage = await utils.sendFromUser({ text: 'SDK test `respondToMessages` sent' })
      driver.respondToMessages(callback, { edited: true })
      const updated = await utils.updateFromUser({
        roomId: 'GENERAL',
        msgId: sentMessage.message._id,
        text: 'SDK test `respondToMessages` edited'
      })
      sinon.assert.calledOnce(callback)
    })
    it('by default ignores DMs', async () => {
      const dmResult = await utils.setupDirectFromUser()
      const callback = sinon.spy()
      driver.respondToMessages(callback)
      await utils.sendFromUser({ text: 'SDK test `respondToMessages` DM', roomId: dmResult.room._id })
      sinon.assert.notCalled(callback)
    })
    it('fires callback on DMs if configured', async () => {
      const dmResult = await utils.setupDirectFromUser()
      const callback = sinon.spy()
      driver.respondToMessages(callback, { dm: true })
      await utils.sendFromUser({ text: 'SDK test `respondToMessages` DM', roomId: dmResult.room._id })
      sinon.assert.calledOnce(callback)
    })
    it('appends room name to event meta in channels', async () => {
      const callback = sinon.spy()
      driver.respondToMessages(callback, { dm: true })
      await utils.sendFromUser({ text: 'SDK test `respondToMessages` DM' })
      expect(callback.firstCall.args[2].roomName).to.equal('general')
    })
    it('room name is undefined in direct messages', async () => {
      const dmResult = await utils.setupDirectFromUser()
      const callback = sinon.spy()
      driver.respondToMessages(callback, { dm: true })
      await utils.sendFromUser({ text: 'SDK test `respondToMessages` DM', roomId: dmResult.room._id })
      expect(callback.firstCall.args[2].roomName).to.equal(undefined)
    })
  })
  describe('.getRoomName', () => {
    beforeEach(async () => {
      await driver.connect()
      await driver.login(credentials)
    })
    it('returns the name for a channel by ID', async () => {
      const room = await driver.getRoomName('GENERAL')
      expect(room).to.equal('general')
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
      await api.login(credentials)
      const testChannel = await utils.channelInfo(utils.testChannelName)
      await api.logout()
      await driver.connect()
      await driver.login(credentials)
      await driver.joinRooms(['general', utils.testChannelName])
      expect(driver.joinedIds).to.eql(['GENERAL', testChannel.channel._id])
    })
  })
})
