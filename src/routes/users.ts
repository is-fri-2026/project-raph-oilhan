import { Router } from "express";
import { requireAuth } from "../auth.js";
import { HttpError } from "../errors.js";
import { idSchema, paginationSchema, userUpdateSchema } from "../schemas.js";
import { deleteUser, findUser, findUserByEmail, listUsers, publicUser, updateUser } from "../store.js";
import { currentUser, parse, requireAdmin } from "../middleware/validation.js";
import { paginate } from "../utils/pagination.js";

export const usersRouter = Router();
usersRouter.use(requireAuth);

usersRouter.get("/", async (request, response) => {
  requireAdmin(request);
  const { page, pageSize } = parse(paginationSchema, request.query);
  response.json(paginate((await listUsers()).map(publicUser), page, pageSize));
});

usersRouter.get("/:id", async (request, response) => {
  const actor = currentUser(request);
  const id = parse(idSchema, request.params.id);
  const target = await findUser(id);
  if (!target) throw new HttpError(404, "Not Found", "User was not found.");
  if (actor.role !== "admin" && actor.id !== id) {
    throw new HttpError(403, "Forbidden", "You can only access your own profile.");
  }
  response.json(publicUser(target));
});

usersRouter.patch("/:id", async (request, response) => {
  const actor = currentUser(request);
  const id = parse(idSchema, request.params.id);
  const target = await findUser(id);
  if (!target) throw new HttpError(404, "Not Found", "User was not found.");
  const dto = parse(userUpdateSchema, request.body);
  if (actor.role !== "admin" && actor.id !== id) {
    throw new HttpError(403, "Forbidden", "You can only update your own profile.");
  }
  if (dto.role !== undefined && actor.role !== "admin") {
    throw new HttpError(403, "Forbidden", "Only administrators can change roles.");
  }
  if (dto.email && dto.email !== target.email && await findUserByEmail(dto.email)) {
    throw new HttpError(409, "Conflict", "Email is already registered.");
  }
  const updated = await updateUser(id, dto);
  response.json(publicUser(updated));
});

usersRouter.delete("/:id", async (request, response) => {
  const actor = currentUser(request);
  const id = parse(idSchema, request.params.id);
  const target = await findUser(id);
  if (!target) throw new HttpError(404, "Not Found", "User was not found.");
  if (actor.role !== "admin" && actor.id !== id) {
    throw new HttpError(403, "Forbidden", "You can only delete your own account.");
  }
  await deleteUser(id);
  response.status(204).send();
});
