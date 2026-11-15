import type { AlternativeStatus, SoftwareAlternative, Task, User, UserRole } from "./types.js";
import { prisma } from "./database.js";

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

function mapTask(task: { id: number; name: string }): Task {
  return { id: task.id, name: task.name };
}

function mapAlternative(alternative: {
  id: number;
  submittedById: number;
  taskId: number;
  name: string;
  description: string;
  status: AlternativeStatus;
  moderationReason: string | null;
  createdAt: Date;
}): SoftwareAlternative {
  return {
    id: alternative.id,
    submittedBy: alternative.submittedById,
    taskId: alternative.taskId,
    name: alternative.name,
    description: alternative.description,
    status: alternative.status,
    moderationReason: alternative.moderationReason,
    createdAt: alternative.createdAt.toISOString(),
  };
}

export async function createUser(
  email: string,
  role: UserRole = "user",
  keycloakSubject?: string,
): Promise<User> {
  const user = await prisma.user.create({
    data: { email, role, keycloakSubject },
  });
  return mapUser(user);
}

export function publicUser(user: User) {
  const { keycloakSubject: _keycloakSubject, ...safeUser } = user;
  return safeUser;
}

export async function seedStore(): Promise<void> {
  const admin = await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: { role: "admin" },
    create: { email: "admin@example.com", role: "admin" },
  });
  const user = await prisma.user.upsert({
    where: { email: "user@example.com" },
    update: {},
    create: { email: "user@example.com", role: "user" },
  });
  const otherUser = await prisma.user.upsert({
    where: { email: "other-user@example.com" },
    update: {},
    create: { email: "other-user@example.com", role: "user" },
  });
  const deleteUser = await prisma.user.upsert({
    where: { email: "await-user@example.com" },
    update: {},
    create: { email: "await-user@example.com", role: "user" },
  });

  const textEditing = await prisma.task.upsert({
    where: { name: "Text editing" },
    update: {},
    create: { name: "Text editing", status: "approved" },
  });
  const webBrowsing = await prisma.task.upsert({
    where: { name: "Web browsing" },
    update: {},
    create: { name: "Web browsing", status: "approved" },
  });

  await prisma.softwareAlternative.upsert({
    where: { submittedById_name: { submittedById: user.id, name: "LibreOffice Writer" } },
    update: {},
    create: {
      submittedById: user.id,
      taskId: textEditing.id,
      name: "LibreOffice Writer",
      description: "A free word processor for older devices.",
      status: "approved",
    },
  });
  await prisma.softwareAlternative.upsert({
    where: { submittedById_name: { submittedById: user.id, name: "Pending alternative" } },
    update: {},
    create: {
      submittedById: user.id,
      taskId: textEditing.id,
      name: "Pending alternative",
      description: "An alternative owned by the user in pending mode : can be modified",
      status: "pending",
    },
  });
  await prisma.softwareAlternative.upsert({
    where: { submittedById_name: { submittedById: user.id, name: "Deletable pending alternative" } },
    update: {},
    create: {
      submittedById: user.id,
      taskId: webBrowsing.id,
      name: "Deletable pending alternative",
      description: "A pending alternative reserved for deletion tests.",
      status: "pending",
    },
  });
  await prisma.softwareAlternative.upsert({
    where: { submittedById_name: { submittedById: otherUser.id, name: "Other user Alternative ID" } },
    update: {},
    create: {
      submittedById: otherUser.id,
      taskId: webBrowsing.id,
      name: "Other user Alternative ID",
      description: "A pending alternative reserved for deletion tests.",
      status: "approved",
    },
  });

  void admin;
  void deleteUser;
}

export async function findUserByEmail(email: string): Promise<User | undefined> {
  const user = await prisma.user.findUnique({ where: { email } });
  return user ? mapUser(user) : undefined;
}

export async function findUserByKeycloakSubject(subject: string): Promise<User | undefined> {
  const user = await prisma.user.findUnique({ where: { keycloakSubject: subject } });
  return user ? mapUser(user) : undefined;
}

export async function findUser(id: number): Promise<User | undefined> {
  const user = await prisma.user.findUnique({ where: { id } });
  return user ? mapUser(user) : undefined;
}

export async function listUsers(): Promise<User[]> {
  const users = await prisma.user.findMany({ orderBy: { id: "asc" } });
  return users.map(mapUser);
}

export async function updateUser(
  id: number,
  data: { email?: string; role?: UserRole },
): Promise<User> {
  return mapUser(await prisma.user.update({ where: { id }, data }));
}

export async function deleteUser(id: number): Promise<void> {
  await prisma.user.delete({ where: { id } });
}

export async function provisionUser(
  email: string,
  role: UserRole,
  keycloakSubject: string,
): Promise<User> {
  const bySubject = await findUserByKeycloakSubject(keycloakSubject);
  if (bySubject) return updateUser(bySubject.id, { email });

  const byEmail = await findUserByEmail(email);
  if (byEmail) return updateUser(byEmail.id, { email });

  return createUser(email, role, keycloakSubject);
}

export async function findAlternative(id: number): Promise<SoftwareAlternative | undefined> {
  const alternative = await prisma.softwareAlternative.findUnique({ where: { id } });
  return alternative ? mapAlternative(alternative) : undefined;
}

export async function listAlternatives(): Promise<SoftwareAlternative[]> {
  const alternatives = await prisma.softwareAlternative.findMany({ orderBy: { id: "asc" } });
  return alternatives.map(mapAlternative);
}

export async function createAlternative(data: {
  submittedBy: number;
  taskId: number;
  name: string;
  description: string;
}): Promise<SoftwareAlternative> {
  return mapAlternative(await prisma.softwareAlternative.create({
    data: {
      submittedById: data.submittedBy,
      taskId: data.taskId,
      name: data.name,
      description: data.description,
      status: "pending",
    },
  }));
}

export async function updateAlternative(
  id: number,
  data: Partial<Pick<SoftwareAlternative, "taskId" | "name" | "description" | "status" | "moderationReason">>,
): Promise<SoftwareAlternative> {
  return mapAlternative(await prisma.softwareAlternative.update({
    where: { id },
    data,
  }));
}

export async function deleteAlternative(id: number): Promise<void> {
  await prisma.softwareAlternative.delete({ where: { id } });
}

export async function isValidTask(id: number): Promise<boolean> {
  const task = await prisma.task.findUnique({ where: { id }, select: { id: true } });
  return task !== null;
}
