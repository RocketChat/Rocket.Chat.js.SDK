export const loginResponse = (
  { userId = 'id', authToken = 'token', username = 'user' } = {}
) => ({
  status: 200,
  data: { data: { userId, authToken, me: { username } } }
})
