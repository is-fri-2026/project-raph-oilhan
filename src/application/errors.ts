// Application errors are translated into HTTP responses by the presentation layer.
export type ApplicationErrorCode = "NOT_FOUND" | "FORBIDDEN" | "CONFLICT";

export class ApplicationError extends Error {
  constructor(
    public readonly code: ApplicationErrorCode,
    message: string,
  ) {
    super(message);
  }
}
