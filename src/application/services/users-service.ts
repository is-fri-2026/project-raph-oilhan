// Orchestrates user use cases, including OIDC identity provisioning.
import {
  canAccessUser,
  canChangeUserRole,
  type User,
  type UserRole,
} from "../../domain/user-domain.js";
import type {
  ListUsersQuery,
  UserPage,
  UserRepository,
  UserUpdate,
} from "../ports/user-repository.js";
import { ApplicationError } from "../errors.js";

export class UsersService {
  constructor(private readonly users: UserRepository) {}

  assertCanList(actor: User): void {
    if (!canChangeUserRole(actor)) {
      throw new ApplicationError("FORBIDDEN", "Administrator role is required.");
    }
  }

  async list(actor: User, query: ListUsersQuery): Promise<UserPage> {
    this.assertCanList(actor);
    return this.users.list(query);
  }

  async get(actor: User, id: number): Promise<User> {
    const target = await this.getForUpdate(id);
    if (!canAccessUser(actor, id)) {
      throw new ApplicationError("FORBIDDEN", "You can only access your own profile.");
    }
    return target;
  }

  async getForUpdate(id: number): Promise<User> {
    const target = await this.users.findById(id);
    if (!target) throw new ApplicationError("NOT_FOUND", "User was not found.");
    return target;
  }

  async update(actor: User, target: User, data: UserUpdate): Promise<User> {
    if (!canAccessUser(actor, target.id)) {
      throw new ApplicationError("FORBIDDEN", "You can only update your own profile.");
    }
    if (data.role !== undefined && !canChangeUserRole(actor)) {
      throw new ApplicationError("FORBIDDEN", "Only administrators can change roles.");
    }
    if (
      data.email
      && data.email !== target.email
      && await this.users.findByEmail(data.email)
    ) {
      throw new ApplicationError("CONFLICT", "Email is already registered.");
    }
    return this.users.update(target.id, data);
  }

  async delete(actor: User, id: number): Promise<void> {
    await this.getForUpdate(id);
    if (!canAccessUser(actor, id)) {
      throw new ApplicationError("FORBIDDEN", "You can only delete your own account.");
    }
    await this.users.delete(id);
  }

  async provisionFromIdentity(
    email: string,
    role: UserRole,
    keycloakSubject: string,
  ): Promise<User> {
    const bySubject = await this.users.findByKeycloakSubject(keycloakSubject);
    if (bySubject) return this.users.update(bySubject.id, { email });

    const byEmail = await this.users.findByEmail(email);
    if (byEmail) return this.users.update(byEmail.id, { email });

    return this.users.create(email, role, keycloakSubject);
  }
}
