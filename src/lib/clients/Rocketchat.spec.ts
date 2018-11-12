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
const botuser = new BotDriver({ logger: new L() })
const adminuser = new BotDriver({})

describe('RocketChat Client', () => {
  before(async () => {
    try {
      await Promise.all([
        adminuser.login({ password: apiUser.password, username: apiUser.username })
      ])
    } catch (e) { console.log(e) }
  })
  describe('connect', () => {
    context('with localhost connection', () => {
      it('without args, returns a promise', () => {
        const promise = botuser.connect({ ...settings } as ISocketOptions)
        expect(promise.then).to.be.a('function')
        promise.catch((err) => console.error(err))
        return promise
      })
      it('accepts an error-first callback, providing socket', async () => {
        return new Promise(resolve => {
          botuser.connect({ ...settings } as ISocketOptions, (err, socket) => {
            expect(err).to.equal(null)
            expect(socket).to.be.an('object')
            resolve()
          })
        })
      })
      it('without url takes localhost as default', () => {

        return new Promise(resolve => {
          botuser.connect({ } as ISocketOptions, (err, socket) => {
            expect(err).to.eql(null)
            expect(socket.config.host).to.contain('localhost:3000')
            resolve()
          })

        })
      })
      it('promise resolves with socket in successful state', () => {
        return botuser.connect({}).then((socket: any) => {
          expect(true).to.equal(socket.connected)
        })
      })
    })

    context('with timeout, on expiry', () => {
      before(async () => {
        clock = sinon.useFakeTimers(0)
      })
      after(() => clock.restore())
      it('with url, attempts connection at URL', () => {
        const botuser = new BotDriver({ host: 'localhost:9999', timeout: 100 })
        return new Promise(resolve => {
          botuser.connect({}, (err, socket) => {
			  expect(err).to.be.an('error')
            resolve()
          }).catch(() => null)
          clock.tick(200)
        })
      })
      it('returns error', (done) => {
        const botuser = new BotDriver({ host: 'localhost:9999', timeout: 100 })
        let opts = { }
        botuser.connect(opts, (err, socket: Socket) => {
          expect(err).to.be.an('error')
          done()
        }).catch(() => null)
        clock.tick(200)
      })
      it('without callback, triggers promise catch', () => {
        const botuser = new BotDriver({ host: 'localhost:9999', timeout: 100 })
        const promise = botuser.connect({ host: 'localhost:9999', timeout: 100 })
				.catch((err) => expect(err).to.be.an('error'))
        clock.tick(200)
        return promise
      })
      it('with callback, provides error to callback', (done) => {
        const botuser = new BotDriver({ host: 'localhost:9999', timeout: 100 })
        botuser.connect({ host: 'localhost:9999', timeout: 100 }, (err) => {
          expect(err).to.be.an('error')
          done()
        }).catch(() => null)
        clock.tick(200)
      })
    })
  })
  describe('.login', () => {
    afterEach(() => botuser.logout())
    it('sets the bot user status to online', async () => {
      const botuser = new BotDriver({})
	  await botuser.login({ username: settings.username, password: settings.password })
	  await delay(1000)
	  const user = await adminuser.users.info(botUser.username)
      expect(user.status).to.equal('online')
    })
  })
  describe('.subscribeToMessages', () => {
    it('resolves with subscription object', async () => {
      const botuser = new BotDriver({ })
      await botuser.login({ username: settings.username, password: settings.password })
      const subscription = await botuser.subscribeToMessages()
      expect(subscription).to.include.keys(['id', 'name', 'unsubscribe', 'onEvent'])
    })
    after(() => botuser.unsubscribeAll())
  })
})
