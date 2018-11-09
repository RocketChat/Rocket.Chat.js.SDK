// Test script uses standard methods and env config to connect and log streams
import ClientRest from '../lib/api/RocketChat'
import { silence } from '../lib/log'
silence()

const api = new ClientRest({})
async function users () {
  console.log(`

			Demo of API user query helpers

			ALL users \`api.users.all()\`:
			${JSON.stringify(await api.users.all(), null, '\t')}

			ALL usernames \`api.users.allNames()\`:
			${JSON.stringify(await api.users.allNames(), null, '\t')}

			ALL IDs \`api.users.allIDs()\`:
			${JSON.stringify(await api.users.allIDs(), null, '\t')}

			ONLINE users \`api.users.online()\`:
			${JSON.stringify(await api.users.online(), null, '\t')}

			ONLINE usernames \`api.users.onlineNames()\`:
			${JSON.stringify(await api.users.onlineNames(), null, '\t')}

			ONLINE IDs \`api.users.onlineIds()\`:
			${JSON.stringify(await api.users.onlineIds(), null, '\t')}

  `)
}

users().catch((e) => console.error(e))
