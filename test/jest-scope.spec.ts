import { execFileSync } from 'child_process'
import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'

const repoRoot = join(__dirname, '..')
const strayDirectory = join(repoRoot, '.jest-scope-fixture')

describe('jest test discovery', () => {
	beforeAll(() => {
		mkdirSync(strayDirectory, { recursive: true })
		writeFileSync(join(strayDirectory, 'stale.spec.ts'), 'it("stale", () => {})\n')
	})

	afterAll(() => rmSync(strayDirectory, { recursive: true, force: true }))

	it('ignores suites outside the SDK source', () => {
		const collected = execFileSync('npx', ['jest', '--listTests'], {
			cwd: repoRoot,
			encoding: 'utf8'
		})

		expect(collected).not.toContain('.jest-scope-fixture')
	})
})
