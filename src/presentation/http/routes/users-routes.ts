// HTTP adapter for user routes: validation, service calls, and response DTOs.
import { Router } from "express";
import type { RequestHandler } from "express";
import { idSchema, paginationSchema, userUpdateSchema } from "../schemas.js";
import { currentUser, parse } from "../middleware/validation.js";
import { UsersService } from "../../../application/services/users-service.js";
import {
  toPublicUserDto,
  toPublicUserPageDto,
} from "../../dto/public-user-dto.js";

export function createUsersRouter(users: UsersService, requireAuth: RequestHandler) {
  const usersRouter = Router();
  usersRouter.use(requireAuth);

  usersRouter.get("/", async (request, response) => {
    const actor = currentUser(request);
    users.assertCanList(actor);
    const query = parse(paginationSchema, request.query);
    response.json(toPublicUserPageDto(await users.list(actor, query)));
  });

  usersRouter.get("/:id", async (request, response) => {
    const actor = currentUser(request);
    const id = parse(idSchema, request.params.id);
    response.json(toPublicUserDto(await users.get(actor, id)));
  });

  usersRouter.patch("/:id", async (request, response) => {
    const actor = currentUser(request);
    const id = parse(idSchema, request.params.id);
    const target = await users.getForUpdate(id);
    const dto = parse(userUpdateSchema, request.body);
    const updated = await users.update(actor, target, dto);
    response.json(toPublicUserDto(updated));
  });

  usersRouter.delete("/:id", async (request, response) => {
    const actor = currentUser(request);
    await users.delete(actor, parse(idSchema, request.params.id));
    response.status(204).send();
  });

  return usersRouter;
}
