/** On require, runs the test utils setup method */
import { setup } from './testing'
import { silence } from '../lib/log'
silence()
setup().catch((e) => console.error(e))
