test('deep driver path resolves under jest', () => {
  const { DDPDriver } = require('@rocket.chat/sdk/lib/drivers/ddp');
  expect(typeof DDPDriver).toBe('function');
});
