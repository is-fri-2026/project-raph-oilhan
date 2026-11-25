// Maps alternative domain models to the response shape exposed by the API.
import type { SoftwareAlternative } from "../../domain/alternative-domain.js";
import type { AlternativePage } from "../../application/ports/alternative-repository.js";

export function toSoftwareAlternativeDto(alternative: SoftwareAlternative) {
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

export function toSoftwareAlternativePageDto(page: AlternativePage) {
  return { ...page, items: page.items.map(toSoftwareAlternativeDto) };
}
