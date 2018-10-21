
import 'mocha'
import sinon from 'sinon'
import { expect } from 'chai'
import * as api from './lib/api'
import { silence } from '../lib/log'
import { mockVisitor } from './lib/mock'
import * as settings from './lib/settings'

async function getVisitorToken () {
  console.log('\nPreparing visitor token for tests...')
  let token = settings.token
  if (!token || token === '') {
	  const { visitor } = await api.livechat.grantVisitor(mockVisitor)
	  token = visitor && visitor.token
  }

  return token
}

async function getRoom (token: string) {
  console.log('\nPreparing room for tests...')
  const { room } = await api.livechat.room({ token })
  return room
}
silence()
describe('Livechat', () => {
	describe('agents', () => {
		before(async function() {
			const token = await getVisitorToken()
			const room = await getRoom(token)
			const rid = room && room._id

			this.token = token
			this.rid = rid
		})
		it('creates message object from content string', async function () {
			console.log({ rid: this.rid, token: this.token }, `

			Get Livechat Agent \`api.livechat.agent()\`:
			${JSON.stringify(await api.livechat.agent({ rid: this.rid, token: this.token }), null, '\t')}

			`)
			// expect(message.msg).to.equal('hello world')

					// Get Livechat Next Agent \`api.livechat.nextAgent()\`:
					// // ${JSON.stringify(await api.livechat.nextAgent({ thistoken, department }), null, '\t')}
			})
		})
})


































// silence()

// async function getVisitorToken () {
//   console.log('\nPreparing visitor token for tests...')
//   let token = settings.token
//   if (!token || token === '') {
// 	  const { visitor } = await api.livechat.grantVisitor(mockVisitor)
// 	  token = visitor && visitor.token
//   }

//   return token
// }

// async function getRoom (token: string) {
//   console.log('\nPreparing room for tests...')
//   const { room } = await api.livechat.room({ token })
//   return room
// }

// async function agent () {
//   const token = await getVisitorToken()

//   const room = await getRoom(token)
//   const rid = room && room._id

//   const department = settings.deparmentId


// }

// agent().catch((e) => console.error(e))
