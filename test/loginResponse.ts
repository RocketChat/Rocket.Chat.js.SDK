export const loginResponse = (
  { userId = 'fake-user-id', authToken = 'fake-token', username = 'fake-username' } = {}
) => ({
  status: 200,
  data: { data: { userId, authToken, me: { username } } }
})
