import 'mocha'
import { expect } from 'chai'
const initEnv = process.env // store configs to restore after tests

describe('settings', () => {
  beforeEach(() => {
    delete process.env.ROCKETCHAT_URL
    delete process.env.ROCKETCHAT_USE_SSL
    delete process.env.ROCKETCHAT_ROOM
    delete process.env.LISTEN_ON_ALL_PUBLIC
    delete process.env.RESPOND_TO_DM
    delete process.env.RESPOND_TO_LIVECHAT
    delete process.env.RESPOND_TO_EDITED
    delete require.cache[require.resolve('./settings')] // clear modules memory
  })
  afterEach(() => process.env = initEnv)
  it('uses localhost URL without SSL if env undefined', () => {
    const settings = require('./settings')
    expect(settings).to.deep.include({
      host: 'localhost:3000',
      useSsl: false,
      timeout: 20000
    })
  })
  it('sets SSL from env if defined', () => {
    process.env.ROCKETCHAT_USE_SSL = 'true'
    const settings = require('./settings')
    expect(settings.useSsl).to.equal(true)
  })
  it('uses SSL if https protocol URL in env', () => {
    process.env.ROCKETCHAT_URL = 'https://localhost:3000'
    const settings = require('./settings')
    expect(settings.useSsl).to.equal(true)
  })
  it('does not use SSL if http protocol URL in env', () => {
    process.env.ROCKETCHAT_URL = 'http://localhost:3000'
    const settings = require('./settings')
    expect(settings.useSsl).to.equal(false)
  })
  it('SSL overrides protocol detection', () => {
    process.env.ROCKETCHAT_URL = 'https://localhost:3000'
    process.env.ROCKETCHAT_USE_SSL = 'false'
    const settings = require('./settings')
    expect(settings.useSsl).to.equal(false)
  })
  it('all respond configs default to false if env undefined', () => {
    const settings = require('./settings')
    expect(settings).to.deep.include({
      rooms: [],
      allPublic: false,
      dm: false,
      livechat: false,
      edited: false
    })
  })
  it('inherits config from env settings', () => {
    process.env.ROCKETCHAT_ROOM = 'GENERAL'
    process.env.LISTEN_ON_ALL_PUBLIC = 'false'
    process.env.RESPOND_TO_DM = 'true'
    process.env.RESPOND_TO_LIVECHAT = 'true'
    process.env.RESPOND_TO_EDITED = 'true'
    const settings = require('./settings')
    expect(settings).to.deep.include({
      rooms: ['GENERAL'],
      allPublic: false,
      dm: true,
      livechat: true,
      edited: true
    })
  })
  it('creates room array from csv list', () => {
    process.env.ROCKETCHAT_ROOM = `general, foo`
    const settings = require('./settings')
    expect(settings.rooms).to.eql(['general', 'foo'])
  })
})
