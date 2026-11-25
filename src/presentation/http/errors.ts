// This file contains the custom error types and utility functions for handling HTTP errors in the application homogeneously.

import { ApplicationError } from "../../application/errors.js";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly title: string,
    message: string,
    public readonly errors?: Record<string, string[]>,
  ) {
    super(message);
  }
}

// Génère un objet Probleme Details a partir d'une erreur, en utilisant les informations de l'erreur si elle est de type HttpError, ou en renvoyant un objet Problem Details générique pour les erreurs inattendues.
export function problemDetails(error: unknown): {
  type: string;
  title: string;
  status: number;
  detail: string;
  errors?: Record<string, string[]>;
} {
  if (error instanceof HttpError) {
    return {
      type: `https://httpstatuses.com/${error.status}`,
      title: error.title,
      status: error.status,
      detail: error.message,
      ...(error.errors ? { errors: error.errors } : {}),
    };
  }

  if (error instanceof ApplicationError) {
    const status = error.code === "FORBIDDEN"
      ? 403
      : error.code === "CONFLICT"
        ? 409
        : 404;
    const title = status === 403
      ? "Forbidden"
      : status === 409
        ? "Conflict"
        : "Not Found";
    return {
      type: `https://httpstatuses.com/${status}`,
      title,
      status,
      detail: error.message,
    };
  }

  return {
    type: "https://httpstatuses.com/500",
    title: "Internal Server Error",
    status: 500,
    detail: "An unexpected error occurred.",
  };
}
