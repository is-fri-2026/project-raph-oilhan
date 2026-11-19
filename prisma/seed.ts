import "dotenv/config";
import { prisma } from "../src/database.js";
import { seedStore } from "../src/store.js";

// The seed is deliberately idempotent so local setup and CI can run it repeatedly.
await seedStore();
await prisma.$disconnect();
