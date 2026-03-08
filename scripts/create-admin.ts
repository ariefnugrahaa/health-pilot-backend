import { PrismaClient, UserRole, UserStatus } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function createAdminUser() {
  try {
    console.log('🔐 Creating admin user...');

    const email = 'admin@healthpilot.com';
    const password = 'Admin123!';
    const firstName = 'Admin';
    const lastName = 'User';

    const hashedPassword = await bcrypt.hash(password, 12);

    const admin = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        passwordHash: hashedPassword,
        firstName,
        lastName,
        isAnonymous: false,
        isEmailVerified: true,
        status: UserStatus.ACTIVE,
        role: UserRole.SUPER_ADMIN,
      },
    });

    console.log('✅ Admin user created successfully!');
    console.log('\n=================================');
    console.log('📋 Admin Login Credentials:');
    console.log('=================================');
    console.log(`Email:    ${email}`);
    console.log(`Password: ${password}`);
    console.log(`Role:     ${admin.role}`);
    console.log('=================================\n');
  } catch (error) {
    console.error('❌ Failed to create admin user:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

createAdminUser();
