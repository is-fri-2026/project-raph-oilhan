// Maps internal users to public DTOs without exposing OIDC identifiers.
import type { User } from "../../domain/user-domain.js";
import type { UserPage } from "../../application/ports/user-repository.js";

export interface PublicUserDto {
  id: number;
  email: string;
  role: User["role"];
  createdAt: string;
}

export function toPublicUserDto(user: User): PublicUserDto {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
  };
}

export function toPublicUserPageDto(page: UserPage) {
  return { ...page, items: page.items.map(toPublicUserDto) };
}
