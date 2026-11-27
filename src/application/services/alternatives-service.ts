// Orchestrates alternative use cases and enforces access and business rules.
import {
  alternativeVisibility,
  canDeleteAlternative,
  canUpdateAlternative,
  DuplicateAlternativeNameError,
  newAlternativeSubmission,
  type AlternativeStatus,
  type SoftwareAlternative,
} from "../../domain/alternative-domain.js";
import type { AlternativeActor } from "../../domain/user-domain.js";
import type {
  AlternativeRepository,
  AlternativeUpdate,
} from "../ports/alternative-repository.js";
import type { Page } from "../page.js";
import { ApplicationError } from "../errors.js";

export interface ListAlternativesInput {
  page: number;
  pageSize: number;
  taskId?: number;
  status?: AlternativeStatus;
  actor?: AlternativeActor;
}

export class AlternativesService {
  constructor(private readonly alternatives: AlternativeRepository) {}

  list(input: ListAlternativesInput): Promise<Page<SoftwareAlternative>> {
    return this.alternatives.list({
      page: input.page,
      pageSize: input.pageSize,
      ...(input.taskId === undefined ? {} : { taskId: input.taskId }),
      ...(input.status === undefined ? {} : { status: input.status }),
      visibility: alternativeVisibility(input.actor, input.status),
    });
  }

  async getApproved(id: number): Promise<SoftwareAlternative> {
    const alternative = await this.alternatives.findById(id);
    if (!alternative || alternative.status !== "approved") {
      throw new ApplicationError("NOT_FOUND", "Software alternative was not found.");
    }
    return alternative;
  }

  async create(
    actor: AlternativeActor,
    input: { taskId: number; name: string; description: string },
  ): Promise<SoftwareAlternative> {
    if (!await this.alternatives.taskExists(input.taskId)) {
      throw new ApplicationError("NOT_FOUND", "Task was not found.");
    }
    if (await this.alternatives.existsBySubmitterAndName(actor.id, input.name)) {
      throw new ApplicationError(
        "CONFLICT",
        "A software alternative with this name has already been submitted.",
      );
    }
    try {
      return await this.alternatives.create(newAlternativeSubmission({
        submittedBy: actor.id,
        ...input,
      }));
    } catch (error) {
      if (error instanceof DuplicateAlternativeNameError) {
        throw new ApplicationError(
          "CONFLICT",
          "A software alternative with this name has already been submitted.",
        );
      }
      throw error;
    }
  }

  async update(
    actor: AlternativeActor,
    alternative: SoftwareAlternative,
    input: AlternativeUpdate,
  ): Promise<SoftwareAlternative> {
    if (!canUpdateAlternative(actor, alternative)) {
      throw new ApplicationError(
        "FORBIDDEN",
        "Only the submitter of a pending alternative can update it.",
      );
    }
    if (
      actor.role !== "admin"
      && (input.status !== undefined || input.moderationReason !== undefined)
    ) {
      throw new ApplicationError("FORBIDDEN", "Only administrators can moderate alternatives.");
    }
    if (input.taskId !== undefined && !await this.alternatives.taskExists(input.taskId)) {
      throw new ApplicationError("NOT_FOUND", "Task was not found.");
    }
    return this.alternatives.update(alternative.id, input);
  }

  async getForUpdate(id: number): Promise<SoftwareAlternative> {
    const alternative = await this.alternatives.findById(id);
    if (!alternative) {
      throw new ApplicationError("NOT_FOUND", "Software alternative was not found.");
    }
    return alternative;
  }

  async delete(actor: AlternativeActor, id: number): Promise<void> {
    const alternative = await this.alternatives.findById(id);
    if (!alternative) {
      throw new ApplicationError("NOT_FOUND", "Software alternative was not found.");
    }
    if (!canDeleteAlternative(actor, alternative)) {
      throw new ApplicationError(
        "FORBIDDEN",
        "Only the submitter of a pending alternative can delete it.",
      );
    }
    await this.alternatives.delete(id);
  }
}
