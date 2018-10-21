import * as api from './lib/api'
import { silence } from '../lib/log'
import { mockVisitor, mockSurvey } from './lib/mock'
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

async function rooms () {
  const token = await getVisitorToken()

  const room = await getRoom(token)
  const rid = room && room._id

  const department = settings.deparmentId

  const email = 'sample@rocket.chat'

  console.log(`

Demo of API livechat query helpers

\`api.livechat.room()\`:
${JSON.stringify(room, null, '\t')}

Transfer Livechat \`api.livechat.tranferChat()\`:
${JSON.stringify(await api.livechat.transferChat({ rid, token, department }), null, '\t')}

Livechat Survey \`api.livechat.chatSurvey()\`:
${JSON.stringify(await api.livechat.chatSurvey({ rid, token, data: mockSurvey }), null, '\t')}

Request Livechat VideoCall \`api.livechat.videoCall()\`:
${JSON.stringify(await api.livechat.videoCall({ rid, token }), null, '\t')}

Close Livechat Room \`api.livechat.closeChat()\`:
${JSON.stringify(await api.livechat.closeChat({ rid, token }), null, '\t')}

Request Livechat Transcript \`api.livechat.requestTranscript()\`:
${JSON.stringify(await api.livechat.requestTranscript(email, { rid, token }), null, '\t')}

  `)
}

rooms().catch((e) => console.error(e))
