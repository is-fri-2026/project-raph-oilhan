import { PrismaClient } from "@prisma/client";

// A single client keeps one connection pool for the API process.
export const prisma = new PrismaClient();
