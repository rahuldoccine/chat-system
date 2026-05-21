/**
 * One-off: promote a user to platform admin by email.
 * Usage: npx tsx prisma/promote-admin.ts your-admin@example.com
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const email = process.argv[2]?.trim();
if (!email) {
  console.error("Usage: npx tsx prisma/promote-admin.ts <email>");
  process.exit(1);
}

const prisma = new PrismaClient();
try {
  const user = await prisma.user.update({
    where: { email },
    data: { isAdmin: true },
    select: { id: true, email: true, isAdmin: true },
  });
  console.log("Promoted to admin:", user);
} catch (e) {
  console.error("Failed - check email exists:", e);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
