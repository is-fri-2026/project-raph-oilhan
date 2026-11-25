// Seeds demonstration data; upserts make this operation safe to rerun.
import "dotenv/config";
import { prisma } from "../src/infrastructure/prisma/client.js";

async function seed(): Promise<void> {
  await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: { role: "admin" },
    create: { email: "admin@example.com", role: "admin" },
  });
  const user = await prisma.user.upsert({
    where: { email: "user@example.com" },
    update: {},
    create: { email: "user@example.com", role: "user" },
  });
  const otherUser = await prisma.user.upsert({
    where: { email: "other-user@example.com" },
    update: {},
    create: { email: "other-user@example.com", role: "user" },
  });
  await prisma.user.upsert({
    where: { email: "await-user@example.com" },
    update: {},
    create: { email: "await-user@example.com", role: "user" },
  });

  const textEditing = await prisma.task.upsert({
    where: { name: "Text editing" },
    update: {},
    create: { name: "Text editing", status: "approved" },
  });
  const webBrowsing = await prisma.task.upsert({
    where: { name: "Web browsing" },
    update: {},
    create: { name: "Web browsing", status: "approved" },
  });

  await prisma.softwareAlternative.upsert({
    where: { submittedById_name: { submittedById: user.id, name: "LibreOffice Writer" } },
    update: {},
    create: {
      submittedById: user.id,
      taskId: textEditing.id,
      name: "LibreOffice Writer",
      description: "A free word processor for older devices.",
      status: "approved",
    },
  });
  await prisma.softwareAlternative.upsert({
    where: { submittedById_name: { submittedById: user.id, name: "Pending alternative" } },
    update: {},
    create: {
      submittedById: user.id,
      taskId: textEditing.id,
      name: "Pending alternative",
      description: "An alternative owned by the user in pending mode : can be modified",
      status: "pending",
    },
  });
  await prisma.softwareAlternative.upsert({
    where: { submittedById_name: { submittedById: user.id, name: "Deletable pending alternative" } },
    update: {},
    create: {
      submittedById: user.id,
      taskId: webBrowsing.id,
      name: "Deletable pending alternative",
      description: "A pending alternative reserved for deletion tests.",
      status: "pending",
    },
  });
  await prisma.softwareAlternative.upsert({
    where: { submittedById_name: { submittedById: otherUser.id, name: "Other user Alternative ID" } },
    update: {},
    create: {
      submittedById: otherUser.id,
      taskId: webBrowsing.id,
      name: "Other user Alternative ID",
      description: "A pending alternative reserved for deletion tests.",
      status: "approved",
    },
  });
}

try {
  await seed();
} finally {
  await prisma.$disconnect();
}
