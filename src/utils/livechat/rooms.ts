import Api from '../../lib/api/Livechat'
import * as settings from '../../lib/settings'
import { silence } from '../../lib/log'
import { mockVisitor, mockSurvey } from '../config'
const livechat = new Api({})
silence()

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
  const { room } = await livechat.room({ token })
  return room
}

async function rooms () {
  const token = await getVisitorToken()
  const room = await getRoom(token)
  const rid = room && room._id
  const department = settings.department
  const email = 'sample@rocket.chat'

  console.log(`

Demo of API livechat query helpers

\`livechat.room()\`:
${JSON.stringify(room, null, '\t')}

Transfer Livechat \`livechat.tranferChat()\`:
${JSON.stringify(await livechat.transferChat({ rid, token, department }), null, '\t')}

Livechat Survey \`livechat.chatSurvey()\`:
${JSON.stringify(await livechat.chatSurvey({ rid, token, data: mockSurvey }), null, '\t')}

Request Livechat VideoCall \`livechat.videoCall()\`:
${JSON.stringify(await livechat.videoCall({ rid, token }), null, '\t')}

Close Livechat Room \`livechat.closeChat()\`:
${JSON.stringify(await livechat.closeChat({ rid, token }), null, '\t')}

Request Livechat Transcript \`livechat.requestTranscript()\`:
${JSON.stringify(await livechat.requestTranscript(email, { rid, token }), null, '\t')}

  `)
}

rooms().catch((e) => console.error(e))
