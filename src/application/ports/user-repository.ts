// User persistence contract consumed by application use cases.
import type { User, UserRole } from "../../domain/user-domain.js";

export interface UserPage {
  items: User[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ListUsersQuery {
  page: number;
  pageSize: number;
}

export interface UserUpdate {
  email?: string;
  role?: UserRole;
}

export interface UserRepository {
  list(query: ListUsersQuery): Promise<UserPage>;
  findById(id: number): Promise<User | undefined>;
  findByEmail(email: string): Promise<User | undefined>;
  findByKeycloakSubject(subject: string): Promise<User | undefined>;
  create(email: string, role: UserRole, keycloakSubject?: string): Promise<User>;
  update(id: number, data: UserUpdate): Promise<User>;
  delete(id: number): Promise<void>;
}
