// Domain model and business rules for software alternatives.
import type { AlternativeActor } from "./user-domain.js";

export const alternativeStatuses = ["pending", "approved", "rejected"] as const;
export type AlternativeStatus = (typeof alternativeStatuses)[number];

export interface SoftwareAlternative {
  id: number;
  submittedBy: number;
  taskId: number;
  name: string;
  description: string;
  status: AlternativeStatus;
  moderationReason: string | null;
  createdAt: string;
}

export class DuplicateAlternativeNameError extends Error {}

export interface NewAlternativeSubmission {
  submittedBy: number;
  taskId: number;
  name: string;
  description: string;
  status: "pending";
  moderationReason: null;
}

export type AlternativeVisibility =
  | { kind: "all" }
  | { kind: "approved" }
  | { kind: "approved-or-owned"; ownerId: number }
  | { kind: "owned"; ownerId: number }
  | { kind: "none" };

export function newAlternativeSubmission(
  data: Omit<NewAlternativeSubmission, "status" | "moderationReason">,
): NewAlternativeSubmission {
  return { ...data, status: "pending", moderationReason: null };
}

export function alternativeVisibility(
  actor: AlternativeActor | undefined,
  requestedStatus: AlternativeStatus | undefined,
): AlternativeVisibility {
  if (actor?.role === "admin") return { kind: "all" };

  if (requestedStatus === "approved") return { kind: "approved" };
  if (requestedStatus !== undefined) {
    return actor ? { kind: "owned", ownerId: actor.id } : { kind: "none" };
  }

  return actor
    ? { kind: "approved-or-owned", ownerId: actor.id }
    : { kind: "approved" };
}

export function canUpdateAlternative(
  actor: AlternativeActor,
  alternative: SoftwareAlternative,
): boolean {
  return actor.role === "admin"
    || (alternative.submittedBy === actor.id && alternative.status === "pending");
}

export function canDeleteAlternative(
  actor: AlternativeActor,
  alternative: SoftwareAlternative,
): boolean {
  return canUpdateAlternative(actor, alternative);
}
