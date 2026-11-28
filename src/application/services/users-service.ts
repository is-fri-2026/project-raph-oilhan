// Orchestrates user use cases, including OIDC identity provisioning.
import {
  canAccessUser,
  canChangeUserRole,
  UserIdentityConflictError,
  type User,
  type UserRole,
} from "../../domain/user-domain.js";
import type {
  ListUsersQuery,
  UserRepository,
  UserUpdate,
} from "../ports/user-repository.js";
import {
  IdentityProviderFailure,
  type IdentityProviderAdmin,
} from "../ports/identity-provider-admin.js";
import type { Page } from "../page.js";
import { ApplicationError } from "../errors.js";

export class UsersService {
  constructor(
    private readonly users: UserRepository,
    private readonly identityProvider: IdentityProviderAdmin,
  ) {}

  assertCanList(actor: User): void {
    if (!canChangeUserRole(actor)) {
      throw new ApplicationError("FORBIDDEN", "Administrator role is required.");
    }
  }

  async list(actor: User, query: ListUsersQuery): Promise<Page<User>> {
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
    const identityChanges = {
      ...(data.email === undefined || data.email === target.email
        ? {}
        : { email: data.email }),
      ...(data.role === undefined
        ? {}
        : { role: data.role }),
    };
    if (Object.keys(identityChanges).length === 0) {
      return this.users.update(target.id, data);
    }
    if (!target.keycloakSubject) {
      throw new ApplicationError(
        "CONFLICT",
        "This user has not been linked to a Keycloak identity yet.",
      );
    }

    await this.updateKeycloakIdentity(target.keycloakSubject, identityChanges);
    try {
      return await this.users.update(target.id, data);
    } catch (error) {
      if (error instanceof UserIdentityConflictError) {
        throw new ApplicationError("CONFLICT", "The user identity conflicts with another account.");
      }
      throw error;
    }
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
    emailVerified: boolean,
  ): Promise<User> {
    const bySubject = await this.users.findByKeycloakSubject(keycloakSubject);
    if (bySubject) {
      if (bySubject.email === email && bySubject.role === role) return bySubject;
      try {
        return await this.users.update(bySubject.id, { email, role });
      } catch (error) {
        if (error instanceof UserIdentityConflictError) {
          throw new ApplicationError("CONFLICT", "The Keycloak email is already linked to another user.");
        }
        throw error;
      }
    }

    const byEmail = await this.users.findByEmail(email);
    if (byEmail) {
      if (!emailVerified) {
        throw new ApplicationError(
          "CONFLICT",
          "A verified email is required to link this Keycloak identity to an existing profile.",
        );
      }
      if (byEmail.keycloakSubject && byEmail.keycloakSubject !== keycloakSubject) {
        throw new ApplicationError("CONFLICT", "This email is already linked to another Keycloak identity.");
      }
      try {
        return await this.users.update(byEmail.id, {
          email,
          role,
          keycloakSubject,
        });
      } catch (error) {
        if (error instanceof UserIdentityConflictError) {
          const linked = await this.users.findByKeycloakSubject(keycloakSubject);
          if (linked) return this.syncIdentityProjection(linked, email, role);
          throw new ApplicationError("CONFLICT", "The Keycloak identity could not be linked to this user.");
        }
        throw error;
      }
    }

    try {
      return await this.users.create(email, role, keycloakSubject);
    } catch (error) {
      if (error instanceof UserIdentityConflictError) {
        const linked = await this.users.findByKeycloakSubject(keycloakSubject);
        if (linked) return this.syncIdentityProjection(linked, email, role);
        throw new ApplicationError("CONFLICT", "The Keycloak identity could not be provisioned.");
      }
      throw error;
    }
  }

  private async syncIdentityProjection(
    user: User,
    email: string,
    role: UserRole,
  ): Promise<User> {
    if (user.email === email && user.role === role) return user;
    try {
      return await this.users.update(user.id, { email, role });
    } catch (error) {
      if (error instanceof UserIdentityConflictError) {
        throw new ApplicationError("CONFLICT", "The Keycloak email is already linked to another user.");
      }
      throw error;
    }
  }

  private async updateKeycloakIdentity(
    subject: string,
    changes: { email?: string; role?: UserRole },
  ): Promise<void> {
    try {
      await this.identityProvider.updateUser(subject, changes);
    } catch (error) {
      if (error instanceof IdentityProviderFailure && error.status === 404) {
        throw new ApplicationError("CONFLICT", "The linked Keycloak identity no longer exists.");
      }
      if (error instanceof IdentityProviderFailure && error.status === 409) {
        throw new ApplicationError("CONFLICT", "Keycloak rejected a conflicting user update.");
      }
      if (error instanceof IdentityProviderFailure) {
        throw new ApplicationError(
          "IDENTITY_PROVIDER",
          "Keycloak could not apply the user update. No application profile changes were saved.",
        );
      }
      throw error;
    }
  }
}
