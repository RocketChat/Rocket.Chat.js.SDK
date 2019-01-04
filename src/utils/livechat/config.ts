import Api from '../../lib/api/Livechat'
import { silence } from '../../lib/log'
import { mockVisitor } from '../config'

silence()

const { token } = mockVisitor.visitor

const livechat = new Api(({}))
async function config () {
  console.log(`

		Get default Livechat Config \`livechat.config()\`:
		${JSON.stringify(await livechat.config(), null, '\t')}

		Get Livechat Config with Token \`livechat.config({ token })\`:
		${JSON.stringify(await livechat.config({ token }), null, '\t')}

	`)
}

config().catch((e) => console.error(e))
