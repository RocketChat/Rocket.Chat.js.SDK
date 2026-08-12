// `restoreMocks` returns every spy to its original implementation between tests,
// so a spy left on a shared module never leaks into the next test. It does not
// touch a standalone `jest.fn()`, so `clearMocks` is what keeps the shared
// `silentLogger` mocks from carrying calls across tests. `collectCoverageFrom`
// makes the report cover the shipped source rather than only the modules some
// test already imports.
//
// Everything else is Jest's default on purpose — `babel-jest` picks up
// babel.config.js with no `transform` entry, and the extensionless relative
// imports in the SDK resolve with no `moduleNameMapper`.
module.exports = {
	clearMocks: true,
	restoreMocks: true,
	collectCoverageFrom: [
		'index.ts',
		'clients/**/*.ts',
		'interfaces/**/*.ts',
		'lib/**/*.ts',
		'!lib/**/__tests__/**'
	],
	setupFilesAfterEnv: ['<rootDir>/test/setup.ts']
}
