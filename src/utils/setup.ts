/** On require, runs the test utils setup method */
import { setup } from './testing'
// import { silence } from '../lib/log'
global.fetch = require('node-fetch')
// silence()
setup().catch((e) => console.error(e))
