// PROTOTYPE — throwaway. Mirrors the app: SDK is transformed, not ignored.
module.exports = {
  rootDir: __dirname,
  testEnvironment: 'node',
  transformIgnorePatterns: ['node_modules/(?!(@rocket.chat/sdk|tiny-events))'],
};
