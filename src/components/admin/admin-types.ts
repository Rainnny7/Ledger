/** The server's built-in demo users (one per persona); they hold sample data, not real accounts. */
export const isDemoEmail = (email: string) =>
  /^demo(-[a-z]+)?@ledger\.invalid$/.test(email)

export interface AdminUser {
  id: string
  name: string
  email: string
  role?: string | null
  banned?: boolean | null
  twoFactorEnabled?: boolean | null
  mustChangePassword?: boolean | null
  createdAt: Date | string
}

export const usersKey = ["admin", "users"] as const
export const settingsKey = ["admin", "settings"] as const

export interface AdminSettings {
  registrationOpen: boolean
  /** The account that set this Ledger up: only it can manage admins or its own account. */
  ownerId: string | null
}

export type UserDialog =
  | { type: "add" }
  | { type: "password"; user: AdminUser }
  | { type: "role"; user: AdminUser }
  | { type: "delete"; user: AdminUser }
  | { type: "ban"; user: AdminUser }
