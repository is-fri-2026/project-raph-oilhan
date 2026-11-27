// Assembles the Express application and connects HTTP adapters to services and repositories.

import "dotenv/config";
import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import { ApplicationError } from "./application/errors.js";
import { HttpError, problemDetails } from "./presentation/http/errors.js";
import { createUsersRouter } from "./presentation/http/routes/users-routes.js";
import { createAlternativesRouter } from "./presentation/http/routes/software-alternatives-routes.js";
import { AlternativesService } from "./application/services/alternatives-service.js";
import { PrismaAlternativeRepository } from "./infrastructure/prisma/alternative-repository.js";
import { UsersService } from "./application/services/users-service.js";
import { PrismaUserRepository } from "./infrastructure/prisma/user-repository.js";
import { createAuthMiddleware } from "./presentation/http/auth.js";

if (!process.env.KEYCLOAK_ISSUER_URL) {
  throw new Error("KEYCLOAK_ISSUER_URL must be configured.");
}

const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

if (allowedOrigins.length === 0 || allowedOrigins.includes("*")) {
  throw new Error("CORS_ALLOWED_ORIGINS must contain explicit origins and cannot include '*'.");
}

for (const origin of allowedOrigins) {
  const parsedOrigin = new URL(origin);
  if (
    parsedOrigin.origin !== origin
    || (parsedOrigin.protocol !== "https:"
      && !["localhost", "127.0.0.1"].includes(parsedOrigin.hostname))
  ) {
    throw new Error(`CORS origin must be an exact HTTPS origin (HTTP is allowed only on localhost): ${origin}`);
  }
}

export const app = express();
app.use(cors({
  origin(origin, callback) {
    callback(null, origin !== undefined && allowedOrigins.includes(origin) ? origin : false);
  },
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Authorization", "Content-Type"],
}));
app.use(express.json({ limit: "1mb" }));

const usersService = new UsersService(new PrismaUserRepository());
const auth = createAuthMiddleware(usersService);

app.get("/health", (_request, response) => response.status(200).json({ status: "ok" }));
app.use("/api/users", createUsersRouter(usersService, auth.requireAuth));
app.use(
  "/api/software-alternatives",
  createAlternativesRouter(
    new AlternativesService(new PrismaAlternativeRepository()),
    auth,
  ),
);

app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  if (!(error instanceof HttpError) && !(error instanceof ApplicationError)) {
    console.error(error);
  }
  const details = problemDetails(error);
  response.status(details.status).type("application/problem+json").json(details);
});
