import 'mocha'
import sinon from 'sinon'
import { expect } from 'chai'
import { Message } from './message'

describe('message', () => {
  describe('constructor', () => {
    it('creates message object from content string', () => {
      let message = new Message('hello world', 'test')
      expect(message.msg).to.equal('hello world')
    })
    it('uses second param as integration ID attribute', () => {
      let message = new Message('hello world', 'test')
      expect(message.bot.i).to.equal('test')
    })
    it('accepts existing message and assigns new properties', () => {
      let message = new Message({
        msg: 'hello world',
        rid: 'GENERAL'
      }, 'test')
      expect(message).to.eql({
        msg: 'hello world',
        rid: 'GENERAL',
        bot: { i: 'test' }
      })
    })
  })
  describe('.setRoomId', () => {
    it('sets rid property', () => {
      let message = new Message('hello world', 'test')
      message.setRoomId('111')
      expect(message.rid).to.equal('111')
    })
    it('updates rid property', () => {
      let message = new Message({
        msg: 'hello world',
        rid: 'GENERAL'
      }, 'test')
      message.setRoomId('111')
      expect(message.rid).to.equal('111')
    })
    it('returns message instance', () => {
      let message = new Message('hello world', 'test')
      expect(message.setRoomId('111')).to.eql(message)
    })
  })
})
