export interface RenownUser {
  username: string
  avatar?: string
  ethAddress?: string
}

export interface LoginAvatarProps {
  isLoggedIn: boolean
  user?: RenownUser
  onLoginClick?: () => void
  profileBaseUrl?: string
}
