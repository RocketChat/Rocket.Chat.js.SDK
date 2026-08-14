test('root entry resolves under jest', () => {
  const sdk = require('@rocket.chat/sdk');
  expect(typeof sdk.Rocketchat).toBe('function');
});
