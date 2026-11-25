import type { User } from "../../domain/user-domain.js";

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export {};
