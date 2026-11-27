export type Credentials = { email: string; password: string }
export type Session = { user: { id: string; email: string }; shop: { id: string; name: string } }
export interface AuthApi {
  login(credentials: Credentials): Promise<void>
  me(): Promise<Session>
  logout(): void
}
