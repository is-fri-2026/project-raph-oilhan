// User domain model and access policies for user profiles.
export const userRoles = ["user", "admin"] as const;
export type UserRole = (typeof userRoles)[number];

export interface User {
  id: number;
  keycloakSubject?: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

export interface AlternativeActor {
  id: number;
  role: UserRole;
}

export function canAccessUser(actor: User, targetId: number): boolean {
  return actor.role === "admin" || actor.id === targetId;
}

export function canChangeUserRole(actor: User): boolean {
  return actor.role === "admin";
}
