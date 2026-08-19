import { ILoginData } from '../interfaces'

export const loginResponse = (
  { userId = 'fake-user-id', authToken = 'fake-token', username = 'fake-username' } = {}
): { status: number, data: { data: ILoginData } } => ({
  status: 200,
  data: { data: { userId, authToken, me: { _id: userId, username } } }
})
