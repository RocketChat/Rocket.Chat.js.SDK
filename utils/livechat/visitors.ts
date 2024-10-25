import Api from '../../lib/api/Livechat'
import { silence } from '../../lib/log'
import { mockVisitor, mockCustomField, mockCustomFields } from '../config'

silence()
const livechat = new Api({})

async function visitors () {
  console.log(`

Demo of API livechat query helpers

Create Livechat Visitor \`livechat.grantVisitor()\`:
${JSON.stringify(await livechat.grantVisitor(mockVisitor), null, '\t')}

Add new Livechat CustomField \`livechat.sendCustomField()\`:
${JSON.stringify(await livechat.sendCustomField(mockCustomField), null, '\t')}

Add new Livechat CustomFields \`livechat.sendCustomFields()\`:
${JSON.stringify(await livechat.sendCustomFields(mockCustomFields), null, '\t')}

\`livechat.visitor()\`:
${JSON.stringify(await livechat.visitor(), null, '\t')}

	`)
}

visitors().catch((e) => console.error(e))
