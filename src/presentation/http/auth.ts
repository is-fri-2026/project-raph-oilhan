// This file validates Keycloak bearer tokens and attaches the application user to the request.

import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { User } from "../../domain/user-domain.js";
import { HttpError } from "./errors.js";
import type { UsersService } from "../../application/services/users-service.js";

const keycloakIssuer = process.env.KEYCLOAK_ISSUER_URL;
const keycloakAudience = process.env.KEYCLOAK_AUDIENCE || "project-api";
const keycloakJwksUrl = process.env.KEYCLOAK_JWKS_URL;
const keycloakJwks = keycloakIssuer
  ? createRemoteJWKSet(new URL(
      keycloakJwksUrl ?? `${keycloakIssuer}/protocol/openid-connect/certs`,
    ))
  : undefined;

export interface AuthMiddleware {
  requireAuth: RequestHandler;
  optionalAuth: RequestHandler;
}

export function createAuthMiddleware(users: UsersService): AuthMiddleware {
  const requireAuth: RequestHandler = (request, _response, next) => {
    const header = request.header("authorization");
    if (!header?.startsWith("Bearer ")) {
      return next(new HttpError(401, "Unauthorized", "A valid bearer token is required."));
    }

    if (!keycloakJwks || !keycloakIssuer) {
      throw new Error("KEYCLOAK_ISSUER_URL must be configured.");
    }
    return requireKeycloakAuth(header.slice(7), request, next, users);
  };

  const optionalAuth: RequestHandler = (request, response, next) => {
    if (!request.header("authorization")) return next();
    return requireAuth(request, response, next);
  };

  return { requireAuth, optionalAuth };
}

async function requireKeycloakAuth(
  token: string,
  request: Request,
  next: NextFunction,
  users: UsersService,
) {
  try {
    const verification = keycloakAudience
      ? await jwtVerify(token, keycloakJwks!, {
          issuer: keycloakIssuer,
          audience: keycloakAudience,
        })
      : await jwtVerify(token, keycloakJwks!, { issuer: keycloakIssuer });
    request.user = await findOrCreateUserFromKeycloakClaims(verification.payload, users);
    return next();
  } catch (error) {
    console.error("Keycloak token validation failed:", error);
    return next(new HttpError(401, "Unauthorized", "A valid bearer token is required."));
  }
}

async function findOrCreateUserFromKeycloakClaims(
  claims: JWTPayload,
  users: UsersService,
): Promise<User> {
  if (typeof claims.sub !== "string") {
    throw new Error("Keycloak token has no subject");
  }

  const email = typeof claims.email === "string" ? claims.email : undefined;
  if (!email) {
    throw new Error("Keycloak token has no email");
  }

  const role = keycloakRoles(claims).includes("admin") ? "admin" : "user";
  return users.provisionFromIdentity(
    email,
    role,
    claims.sub,
    claims.email_verified === true,
  );
}

function keycloakRoles(claims: JWTPayload): string[] {
  const realmAccess = claims.realm_access;
  if (
    typeof realmAccess === "object" &&
    realmAccess !== null &&
    "roles" in realmAccess &&
    Array.isArray(realmAccess.roles)
  ) {
    return realmAccess.roles.filter((role): role is string => typeof role === "string");
  }
  return [];
}
