// Maps alternative domain models to the response shape exposed by the API.
import type { SoftwareAlternative } from "../../domain/alternative-domain.js";
import type { Page } from "../../application/page.js";

export interface SoftwareAlternativeDto {
  id: number;
  submittedBy: number;
  taskId: number;
  name: string;
  description: string;
  status: SoftwareAlternative["status"];
  moderationReason: string | null;
  createdAt: string;
}

export function toSoftwareAlternativeDto(
  alternative: SoftwareAlternative,
): SoftwareAlternativeDto {
  return {
    id: alternative.id,
    submittedBy: alternative.submittedBy,
    taskId: alternative.taskId,
    name: alternative.name,
    description: alternative.description,
    status: alternative.status,
    moderationReason: alternative.moderationReason,
    createdAt: alternative.createdAt,
  };
}

export function toSoftwareAlternativePageDto(page: Page<SoftwareAlternative>) {
  return { ...page, items: page.items.map(toSoftwareAlternativeDto) };
}
