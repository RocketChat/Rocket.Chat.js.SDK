import 'mocha'
import sinon from 'sinon'
import { expect } from 'chai'
import { silence } from '../log'
import { botUser } from '../../utils/config'
import { Socket } from './ddp'
import { isLoginResult } from '../../interfaces'
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve,ms))
silence() // suppress logs
let socket: Socket = new Socket({})

describe('[ddp]', () => {
  afterEach(async () => {
    socket = new Socket({})
  })
  describe('constructor', () => {
    it('sets ws host to default host', () => {
      expect(socket.host).to.equal('ws://localhost:3000/websocket')
    })
  })
  describe('.open', () => {
    it('opens ws to host without error', async () => {
      await socket.open()
      expect(socket.connected).to.equal(true)

    })
    it('establishes session with connection message', async () => {
      await socket.open().catch((err) => console.log(err))
      expect(socket.session).to.have.lengthOf(17)
    })
  })
  describe('.close', () => {
    it('closes connection', async () => {
      await socket.open()
      await socket.close()
      expect(socket.connected).to.equal(false)
    })
  })
  describe('.send', () => {
    it('sends websocket message to host', async () => {
      await socket.open()
      const sent = await socket.send({ msg: 'ping' })
      expect(sent).to.have.keys(['msg'])
    })
    it('good async methods resolve with data', async () => {
				// @todo this is the only method to test a webhook without a login
				//       should add another server method to for some basic public stats
				//       e.g. version number, then update test to check attributes resolve
      await socket.open()
      const data = await socket.send({
        msg: 'method', method: 'loadLocale', params: ['en-au']
      })
      expect(data).to.be.a('object')
    })
    it('bad async methods reject with errors', async () => {
      await socket.open()
      return socket.send({
        msg: 'method', method: 'registerUser', params: [{
          email: 'not-an-email',
          pass: 'pass',
          name: 'ddp-test'
        }]
      })
				.then((data) => expect(true).to.equal(false))
				.catch((err) => expect(err.message).to.match(/invalid email/i))
    })
  })
  describe('.login', () => {
    it('resolves with login result', async () => {
      await socket.open()
      const result = await socket.login(botUser)
				.catch((err) => expect(typeof err).to.equal('undefined'))
      expect(isLoginResult(result)).to.equal(true)
    })
    it('rejects with unknown user', async () => {
      await socket.open()
      return socket.login({
        username: 'nobody',
        password: 'nothing'
      })
				.then(() => expect(true).to.equal(false))
				.catch((err) => expect(err.error).to.equal(403))
    })
    it('can call restricted methods for user', async () => {
      await socket.open()
      const subs = await socket.call('subscriptions/get')
      expect(subs).to.be.an('array')
    })
    it('can use resolved token to resume login', async () => {
      await socket.open()
      const result = await socket.login(botUser)
      await socket.close()
      socket.resume = null
      await socket.open()
      await socket.login(result)
      const subs = await socket.call('subscriptions/get')
      expect(subs).to.be.an('array')
    })
    it('.open resumes login with existing token', async () => {
      await socket.open()
      const result = await socket.login(botUser)
      await socket.close()
      await socket.open()
      const subs = await socket.call('subscriptions/get')
      expect(subs).to.be.an('array')
    })
  })
  describe('.subscribe', () => {
    it('resolves with subscription ID', async () => {
      await socket.open()
      await socket.login(botUser)
      const name = 'stream-room-messages'
      const room = '__my_messages__'
      const sub = await socket.subscribe(name, [room, true])
				.catch((err) => expect(typeof err).to.equal('undefined'))
      expect(sub).to.include.keys('id', 'name', 'unsubscribe')
    })
    it('emits stream events with ID', () => {
      return new Promise(async (resolve) => {
        await socket.open()
        await socket.login(botUser)
        const name = 'stream-room-messages'
        const room = '__my_messages__'
        await socket.subscribe(name, [room, true], (data: any) => {
          expect(data.msg).to.equal('changed')
          resolve()
        })

        socket.once(name, (data: any) => {
          expect(data.msg).to.equal('changed')
          resolve()
        })
        await socket.call('sendMessage', { rid: 'GENERAL', msg: 'testing' })
      })
    })
    it('handler fires callback with event data', () => {
      return new Promise(async (resolve) => {
        await socket.open()
        await socket.login(botUser)
        const name = 'stream-room-messages'
        const room = '__my_messages__'
        await socket.subscribe(name, [room, true], (data) => {
          expect(data.msg).to.equal('changed')
          resolve(data)
        })
        await socket.call('sendMessage', { rid: 'GENERAL', msg: 'sub test' })
      })
    })
    it('handler fires callback on every event', async function () {
				// this.timeout(120000) // 2 min timeout for debug onMessage step through
      await socket.open()
      await socket.login(botUser)
      const name = 'stream-room-messages'
      const room = '__my_messages__'
      const spy = sinon.spy()
      await socket.subscribe(name, [room, true], spy)
      await socket.call('sendMessage', { rid: 'GENERAL', msg: 'sub test 1' })
      await socket.call('sendMessage', { rid: 'GENERAL', msg: 'sub test 2' })
      await socket.call('sendMessage', { rid: 'GENERAL', msg: 'sub test 3' })
      await delay(300)
      sinon.assert.callCount(spy, 3)
      expect(spy.args.map((c) => c[0].fields.args[0].msg)).to.eql([
        'sub test 1', 'sub test 2', 'sub test 3'
      ])
    })
  })
})
