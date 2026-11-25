// Prisma implementation of the user persistence contract.
import { prisma } from "./client.js";
import type { User, UserRole } from "../../domain/user-domain.js";
import type {
  ListUsersQuery,
  UserPage,
  UserRepository,
  UserUpdate,
} from "../../application/ports/user-repository.js";

function mapUser(user: {
  id: number;
  keycloakSubject: string | null;
  email: string;
  role: UserRole;
  createdAt: Date;
}): User {
  return {
    id: user.id,
    keycloakSubject: user.keycloakSubject ?? undefined,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  };
}

export class PrismaUserRepository implements UserRepository {
  async list(query: ListUsersQuery): Promise<UserPage> {
    const [rows, total] = await Promise.all([
      prisma.user.findMany({
        orderBy: { id: "asc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.user.count(),
    ]);

    return {
      items: rows.map(mapUser),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async findById(id: number): Promise<User | undefined> {
    const user = await prisma.user.findUnique({ where: { id } });
    return user ? mapUser(user) : undefined;
  }

  async findByEmail(email: string): Promise<User | undefined> {
    const user = await prisma.user.findUnique({ where: { email } });
    return user ? mapUser(user) : undefined;
  }

  async findByKeycloakSubject(subject: string): Promise<User | undefined> {
    const user = await prisma.user.findUnique({ where: { keycloakSubject: subject } });
    return user ? mapUser(user) : undefined;
  }

  async create(email: string, role: UserRole, keycloakSubject?: string): Promise<User> {
    const user = await prisma.user.create({
      data: { email, role, keycloakSubject },
    });
    return mapUser(user);
  }

  async update(id: number, data: UserUpdate): Promise<User> {
    const user = await prisma.user.update({ where: { id }, data });
    return mapUser(user);
  }

  async delete(id: number): Promise<void> {
    await prisma.user.delete({ where: { id } });
  }
}
