// Maps internal users to public DTOs without exposing OIDC identifiers.
import type { User } from "../../domain/user-domain.js";
import type { Page } from "../../application/page.js";

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

export function toPublicUserPageDto(page: Page<User>) {
  return { ...page, items: page.items.map(toPublicUserDto) };
}
