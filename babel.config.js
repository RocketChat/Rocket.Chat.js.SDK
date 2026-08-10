// Transform config for the test runner only — nothing here affects the shipped
// package, which the consuming app compiles from raw TypeScript itself.
//
// Deliberately standalone: `preset-typescript` erases types without checking
// them (typechecking is `npm run typecheck`), and `preset-env` targets the
// running Node. No Expo, no React Native, no dependency on the app's config.
module.exports = {
	presets: [
		['@babel/preset-env', { targets: { node: 'current' } }],
		'@babel/preset-typescript'
	]
}
