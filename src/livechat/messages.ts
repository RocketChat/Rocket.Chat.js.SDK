import * as api from './lib/api'
import { silence } from '../lib/log'
import { mockVisitor, mockOfflineMessage, mockVisitorNavigation } from './lib/mock'
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

async function messages () {
  const token = await getVisitorToken()

  const room = await getRoom(token)
  const rid = room && room._id

  const newMessage = {
	  token,
	  rid,
	  msg: 'sending livechat message..'
  }

  const editMessage = {
	  token,
	  rid,
	  msg: 'editing livechat message..'
  }

  const result = await api.livechat.sendMessage(newMessage)
  const _id = result && result.message && result.message._id

  const roomCredential = { token, rid }
  const pageInfo = Object.assign({}, mockVisitorNavigation, { rid })

  console.log(`

Demo of API livechat query helpers

Send Livechat Message \`api.livechat.sendMessage()\`:
${JSON.stringify(result, null, '\t')}

Edit Livechat Message \`api.livechat.editMessage()\`:
${JSON.stringify(await api.livechat.editMessage(_id, editMessage), null, '\t')}

Load Livechat Messages \`api.livechat.loadMessages()\`:
${JSON.stringify(await api.livechat.loadMessages(rid, { token }), null, '\t')}

Delete Livechat Message \`api.livechat.deleteMessage()\`:
${JSON.stringify(await api.livechat.deleteMessage(_id, { token, rid }), null, '\t')}

Send Livechat Offline Message \`api.livechat.sendOfflineMessage()\`:
${JSON.stringify(await api.livechat.sendOfflineMessage(mockOfflineMessage), null, '\t')}

Send Livechat Visitor Navigation \`api.livechat.sendVisitorNavigation()\`:
${JSON.stringify(await api.livechat.sendVisitorNavigation(roomCredential, pageInfo), null, '\t')}

  `)
}

messages().catch((e) => console.error(e))
