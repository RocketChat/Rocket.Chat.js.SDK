import * as api from './lib/api'
import { silence } from '../lib/log'
import { mockVisitor } from './lib/mock'
import * as settings from './lib/settings'

silence()

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

async function agent () {
  const token = await getVisitorToken()

  const room = await getRoom(token)
  const rid = room && room._id

  const department = settings.deparmentId

  console.log(`

    Get Livechat Agent \`api.livechat.agent()\`:
    ${JSON.stringify(await api.livechat.agent({ rid, token }), null, '\t')}

    Get Livechat Next Agent \`api.livechat.nextAgent()\`:
    ${JSON.stringify(await api.livechat.nextAgent({ token, department }), null, '\t')}

  `)
}

agent().catch((e) => console.error(e))
