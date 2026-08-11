// One key beyond the setup registration: `restoreMocks` returns every spy to its
// original implementation between tests, so a spy left on a shared module never
// leaks into the next test. Everything else is Jest's default on purpose —
// `babel-jest` picks up babel.config.js with no `transform` entry, and the
// extensionless relative imports in the SDK resolve with no `moduleNameMapper`.
module.exports = {
	restoreMocks: true,
	setupFilesAfterEnv: ['<rootDir>/test/setup.ts']
}
