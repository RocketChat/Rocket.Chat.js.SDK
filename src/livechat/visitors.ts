import * as api from './lib/api'
import { silence } from '../lib/log'
import { mockVisitor, mockCustomField, mockCustomFields } from './lib/mock'

silence()

const { token } = mockVisitor.visitor

async function visitors () {
  console.log(`

Demo of API livechat query helpers

Create Livechat Visitor \`api.livechat.grantVisitor()\`:
${JSON.stringify(await api.livechat.grantVisitor(mockVisitor), null, '\t')}

Add new Livechat CustomField \`api.livechat.sendCustomField()\`:
${JSON.stringify(await api.livechat.sendCustomField(mockCustomField), null, '\t')}

Add new Livechat CustomFields \`api.livechat.sendCustomFields()\`:
${JSON.stringify(await api.livechat.sendCustomFields(mockCustomFields), null, '\t')}

\`api.livechat.visitor()\`:
${JSON.stringify(await api.livechat.visitor({ token }), null, '\t')}

	`)
}

visitors().catch((e) => console.error(e))
