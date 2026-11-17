import { RoleCode } from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { ensureReferenceData } from '../src/lib/bootstrap';
import { hashPassword } from '../src/lib/crypto';

async function main() {
  await ensureReferenceData();
  console.log('Reference roles, device types, permissions, and system settings ensured.');

  const adminUsername = process.env.INITIAL_ADMIN_USERNAME?.trim();
  const adminPassword = process.env.INITIAL_ADMIN_PASSWORD;
  const adminEmail = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();

  const userCount = await prisma.user.count();
  if (userCount === 0 && adminUsername && adminPassword && adminEmail) {
    if (adminPassword.length < 10) {
      throw new Error('INITIAL_ADMIN_PASSWORD must be at least 10 characters');
    }
    const superAdminRole = await prisma.role.findUniqueOrThrow({
      where: { code: RoleCode.SUPER_ADMIN },
    });
    const passwordHash = await hashPassword(adminPassword);
    await prisma.user.create({
      data: {
        username: adminUsername,
        email: adminEmail,
        fullName: process.env.INITIAL_ADMIN_FULLNAME?.trim() || 'System Super Administrator',
        passwordHash,
        roleId: superAdminRole.id,
        isActive: true,
      },
    });
    console.log(`Initial Super Admin "${adminUsername}" created from environment variables.`);
  } else if (userCount === 0) {
    console.log(
      'No users exist yet. Open /setup in the web UI or set INITIAL_ADMIN_* env vars to create the first Super Admin.',
    );
  }
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
