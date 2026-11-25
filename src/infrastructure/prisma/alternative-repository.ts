// Prisma implementation of the alternative persistence contract.
import { Prisma } from "@prisma/client";
import { prisma } from "./client.js";
import type {
  AlternativeStatus,
  AlternativeVisibility,
  NewAlternativeSubmission,
  SoftwareAlternative,
} from "../../domain/alternative-domain.js";
import { DuplicateAlternativeNameError } from "../../domain/alternative-domain.js";
import type {
  AlternativePage,
  AlternativeRepository,
  AlternativeUpdate,
  ListAlternativesQuery,
} from "../../application/ports/alternative-repository.js";

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

function toWhere(query: ListAlternativesQuery) {
  const where: {
    id?: number;
    taskId?: number;
    status?: AlternativeStatus;
    submittedById?: number;
    OR?: Array<{ status?: AlternativeStatus; submittedById?: number }>;
  } = query.taskId === undefined ? {} : { taskId: query.taskId };

  switch (query.visibility.kind) {
    case "all":
      if (query.status !== undefined) where.status = query.status;
      break;
    case "approved":
      where.status = "approved";
      break;
    case "approved-or-owned":
      where.OR = [
        { status: "approved" },
        { submittedById: query.visibility.ownerId },
      ];
      break;
    case "owned":
      where.submittedById = query.visibility.ownerId;
      if (query.status !== undefined) where.status = query.status;
      break;
    case "none":
      where.id = -1;
      break;
  }

  return where;
}

export class PrismaAlternativeRepository implements AlternativeRepository {
  async list(query: ListAlternativesQuery): Promise<AlternativePage> {
    const where = toWhere(query);
    const [rows, total] = await Promise.all([
      prisma.softwareAlternative.findMany({
        where,
        orderBy: { id: "asc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.softwareAlternative.count({ where }),
    ]);

    return {
      items: rows.map(mapAlternative),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async findById(id: number): Promise<SoftwareAlternative | undefined> {
    const alternative = await prisma.softwareAlternative.findUnique({ where: { id } });
    return alternative ? mapAlternative(alternative) : undefined;
  }

  async existsBySubmitterAndName(submittedBy: number, name: string): Promise<boolean> {
    const alternative = await prisma.softwareAlternative.findUnique({
      where: { submittedById_name: { submittedById: submittedBy, name } },
      select: { id: true },
    });
    return alternative !== null;
  }

  async create(data: NewAlternativeSubmission): Promise<SoftwareAlternative> {
    try {
      const alternative = await prisma.softwareAlternative.create({
        data: {
          submittedById: data.submittedBy,
          taskId: data.taskId,
          name: data.name,
          description: data.description,
          status: data.status,
          moderationReason: data.moderationReason,
        },
      });
      return mapAlternative(alternative);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError
        && error.code === "P2002"
      ) {
        throw new DuplicateAlternativeNameError();
      }
      throw error;
    }
  }

  async update(id: number, data: AlternativeUpdate): Promise<SoftwareAlternative> {
    const alternative = await prisma.softwareAlternative.update({ where: { id }, data });
    return mapAlternative(alternative);
  }

  async delete(id: number): Promise<void> {
    await prisma.softwareAlternative.delete({ where: { id } });
  }

  async taskExists(id: number): Promise<boolean> {
    const task = await prisma.task.findUnique({ where: { id }, select: { id: true } });
    return task !== null;
  }
}
