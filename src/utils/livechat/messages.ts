import Api from '../../lib/api/Livechat'
import * as settings from '../../lib/settings'
import { silence } from '../../lib/log'
import { mockVisitor, mockOfflineMessage, mockVisitorNavigation } from '../config'

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

async function messages () {
  const token = await getVisitorToken()
  const room = await getRoom(token)
  const rid = room && room._id
  const newMessage = { token, rid, msg: 'sending livechat message..' }
  const editMessage = { token, rid, msg: 'editing livechat message..' }
  const result = await livechat.sendMessage(newMessage)
  const _id = result && result.message && result.message._id
  const roomCredential = { token, rid }
  const pageInfo = Object.assign({}, mockVisitorNavigation, { rid })

  console.log(`

Demo of API livechat query helpers

Send Livechat Message \`livechat.sendMessage()\`:
${JSON.stringify(result, null, '\t')}

Edit Livechat Message \`livechat.editMessage()\`:
${JSON.stringify(await livechat.editMessage(_id, editMessage), null, '\t')}

Load Livechat Messages \`livechat.loadMessages()\`:
${JSON.stringify(await livechat.loadMessages(rid, { token }), null, '\t')}

Delete Livechat Message \`livechat.deleteMessage()\`:
${JSON.stringify(await livechat.deleteMessage(_id, { rid }), null, '\t')}

Send Livechat Offline Message \`livechat.sendOfflineMessage()\`:
${JSON.stringify(await livechat.sendOfflineMessage(mockOfflineMessage), null, '\t')}

Send Livechat Visitor Navigation \`livechat.sendVisitorNavigation()\`:
${JSON.stringify(await livechat.sendVisitorNavigation(roomCredential, pageInfo), null, '\t')}

  `)
}

messages().catch((e) => console.error(e))
