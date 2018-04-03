process.env.LOG_LEVEL = 'silent' // suppress API logs

import 'mocha'
import sinon from 'sinon'
import { expect } from 'chai'
import { silence } from './log'
import { botUser } from '../utils/config'
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
  /*
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
          const isActive = asteroid.ddp.readyState === 1
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
  */
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
      const result = await utils.getUserData({ username: botUser.username })
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
  describe('.sendMessageByRoomId', () => {
    it('sends to the given room name', async () => {
      await driver.connect()
      await driver.login(credentials)
      await driver.subscribeToMessages()
      await driver.sendMessageByRoomId('SDK test `sendMessageByRoomId`', 'GENERAL')
    })
  })
  describe('.respondDefaults', () => {
    afterEach(() => process.env = initEnv)
    it('all configs default to false if env undefined', () => {
      delete process.env.LISTEN_ON_ALL_PUBLIC
      delete process.env.RESPOND_TO_DM
      delete process.env.RESPOND_TO_LIVECHAT
      delete process.env.RESPOND_TO_EDITED
      const defaults = driver.respondDefaults()
      expect(defaults).to.eql({
        allPublic: false,
        dm: false,
        livechat: false,
        edited: false
      })
    })
    it('inherits config from env defaults', () => {
      process.env.LISTEN_ON_ALL_PUBLIC = 'false'
      process.env.RESPOND_TO_DM = 'true'
      process.env.RESPOND_TO_LIVECHAT = 'true'
      process.env.RESPOND_TO_EDITED = 'true'
      const defaults = driver.respondDefaults()
      expect(defaults).to.eql({
        allPublic: false,
        dm: true,
        livechat: true,
        edited: true
      })
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
    it('ignores messages sent from bot', async () => {
      const callback = sinon.spy()
      driver.respondToMessages(callback)
      await driver.sendMessageByRoomId('SDK test `respondToMessages`', 'GENERAL')
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
  })
})
