/** On require, runs the test utils setup method */
import { setup } from './testing'
setup().catch((e) => console.error(e))
