// HTTP adapter for software-alternative routes: validation, service calls, and response DTOs.
import { Router } from "express";
import { z } from "zod";
import type { AuthMiddleware } from "../auth.js";
import {
  idSchema,
  alternativeCreateSchema,
  alternativeUpdateSchema,
  paginationSchema,
} from "../schemas.js";
import { currentUser, parse } from "../middleware/validation.js";
import { AlternativesService } from "../../../application/services/alternatives-service.js";
import {
  toSoftwareAlternativeDto,
  toSoftwareAlternativePageDto,
} from "../../dto/software-alternative-dto.js";

export function createAlternativesRouter(
  alternatives: AlternativesService,
  auth: AuthMiddleware,
) {
  const alternativesRouter = Router();

  // Keep the collection public while identifying authenticated owners for pending alternatives.
  alternativesRouter.get("/", auth.optionalAuth, async (request, response) => {
    const { page, pageSize } = parse(paginationSchema, request.query);
    const taskId = request.query.taskId === undefined
      ? undefined
      : parse(idSchema, request.query.taskId);
    const status = request.query.status === undefined
      ? undefined
      : parse(z.enum(["pending", "approved", "rejected"]), request.query.status);
    response.json(toSoftwareAlternativePageDto(await alternatives.list({
      page,
      pageSize,
      taskId,
      status,
      actor: request.user,
    })));
  });

  alternativesRouter.get("/:id", async (request, response) => {
    response.json(toSoftwareAlternativeDto(
      await alternatives.getApproved(parse(idSchema, request.params.id)),
    ));
  });

  alternativesRouter.post("/", auth.requireAuth, async (request, response) => {
    const user = currentUser(request);
    const dto = parse(alternativeCreateSchema, request.body);
    const alternative = await alternatives.create(user, dto);
    response.location(`/api/software-alternatives/${alternative.id}`)
      .status(201)
      .json(toSoftwareAlternativeDto(alternative));
  });

  alternativesRouter.patch("/:id", auth.requireAuth, async (request, response) => {
    const actor = currentUser(request);
    const id = parse(idSchema, request.params.id);
    const existing = await alternatives.getForUpdate(id);
    const dto = parse(alternativeUpdateSchema, request.body);
    const alternative = await alternatives.update(actor, existing, dto);
    response.json(toSoftwareAlternativeDto(alternative));
  });

  alternativesRouter.delete("/:id", auth.requireAuth, async (request, response) => {
    const actor = currentUser(request);
    await alternatives.delete(actor, parse(idSchema, request.params.id));
    response.status(204).send();
  });

  return alternativesRouter;
}
