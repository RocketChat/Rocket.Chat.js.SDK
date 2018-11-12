import Api from '../../lib/api/Livechat'
import * as settings from '../../lib/settings'
import { silence } from '../../lib/log'
import { mockVisitor } from '../config'

silence()
const livechat = new Api({})
async function getVisitorToken () {
  console.log('\nPreparing visitor token for tests...')
  let token = settings.token
  if (!token || token === '') {
	  const { visitor } = await livechat.grantVisitor(mockVisitor)
	  token = visitor && visitor.token
  }

  return token
}

async function getRoom (token: string) {
  console.log('\nPreparing room for tests...')
  const { room } = await livechat.room()
  return room
}

async function agent () {
  const token = await getVisitorToken()
  const room = await getRoom(token)
  const rid = room && room._id
  const department = settings.department

  console.log(`
		Get Livechat Agent \`livechat.agent()\`:
		${JSON.stringify(await livechat.agent({ rid, token }), null, '\t')}

		Get Livechat Next Agent \`livechat.nextAgent()\`:
		${JSON.stringify(await livechat.nextAgent({ token, department }), null, '\t')}
  `)
}

agent().catch((e) => console.error(e))
