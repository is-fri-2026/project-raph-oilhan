// Persistence contract consumed by the application service, independent of Prisma.
import type { Page } from "../page.js";
import type {
  AlternativeStatus,
  AlternativeVisibility,
  NewAlternativeSubmission,
  SoftwareAlternative,
} from "../../domain/alternative-domain.js";

export interface ListAlternativesQuery {
  page: number;
  pageSize: number;
  taskId?: number;
  status?: AlternativeStatus;
  visibility: AlternativeVisibility;
}

export type AlternativeUpdate = Partial<
  Pick<SoftwareAlternative, "taskId" | "name" | "description" | "status" | "moderationReason">
>;

export interface AlternativeRepository {
  list(query: ListAlternativesQuery): Promise<Page<SoftwareAlternative>>;
  findById(id: number): Promise<SoftwareAlternative | undefined>;
  existsBySubmitterAndName(submittedBy: number, name: string): Promise<boolean>;
  create(data: NewAlternativeSubmission): Promise<SoftwareAlternative>;
  update(id: number, data: AlternativeUpdate): Promise<SoftwareAlternative>;
  delete(id: number): Promise<void>;
  taskExists(id: number): Promise<boolean>;
}
