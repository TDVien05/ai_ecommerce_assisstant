export type Credentials = { email: string; password: string }
export type Registration = Credentials & { ownerName: string; shopName: string; acceptedTerms: boolean }
export type Session = { user: { id: string; email: string; ownerName: string | null }; shop: { id: string; name: string; isDemo: boolean } }
export interface AuthApi {
  login(credentials: Credentials): Promise<void>
  register(data: Registration): Promise<void>
  demo(): Promise<void>
  me(): Promise<Session>
  logout(): void
}
