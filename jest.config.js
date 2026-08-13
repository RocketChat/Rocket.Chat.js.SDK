// `restoreMocks` returns every spy to its original implementation between tests,
// so a spy left on a shared module never leaks into the next test. It does not
// touch a standalone `jest.fn()`, so `clearMocks` is what keeps the shared
// `silentLogger` mocks from carrying calls across tests.
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
