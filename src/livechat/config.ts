import * as api from './lib/api'
import { silence } from '../lib/log'
import { mockVisitor } from './lib/mock'

silence()

const { token } = mockVisitor.visitor

async function config () {
  console.log(`

Get deafult Livechat Config \`api.livechat.config()\`:
${JSON.stringify(await api.livechat.config(), null, '\t')}

Get Livechat Config with Token \`api.livechat.config({ token })\`:
${JSON.stringify(await api.livechat.config({ token }), null, '\t')}

	`)
}

config().catch((e) => console.error(e))
