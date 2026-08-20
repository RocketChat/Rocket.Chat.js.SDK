// `restoreMocks` returns every spy to its original implementation between tests,
// so a spy left on a shared module never leaks into the next test.
// `collectCoverageFrom` makes the report cover the shipped source rather than
// only the modules some test already imports.
// `roots` keeps discovery inside the SDK, so *.spec.ts files in any other
// directory under the repo root are never collected.
//
// Everything else is Jest's default on purpose — `babel-jest` picks up
// babel.config.js with no `transform` entry, and the extensionless relative
// imports in the SDK resolve with no `moduleNameMapper`.
module.exports = {
	roots: ['<rootDir>/interfaces', '<rootDir>/lib', '<rootDir>/test'],
	restoreMocks: true,
	collectCoverageFrom: [
		'index.ts',
		'interfaces/**/*.ts',
		'lib/**/*.ts',
		'!lib/**/__tests__/**'
	],
	setupFilesAfterEnv: ['<rootDir>/test/setup.ts']
}
