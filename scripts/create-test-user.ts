/**
 * Create Test User Script
 * Run this script to create a test user for E2E testing
 *
 * Usage: npx tsx scripts/create-test-user.ts
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const TEST_USER = {
  email: 'test@healthpilot.com',
  password: 'Test123!',
  firstName: 'Test',
  lastName: 'User',
};

async function createTestUser() {
  try {
    // Hash password and enforce known credentials.
    const hashedPassword = await bcrypt.hash(TEST_USER.password, 10);

    const user = await prisma.user.upsert({
      where: { email: TEST_USER.email },
      update: {
        passwordHash: hashedPassword,
        firstName: TEST_USER.firstName,
        lastName: TEST_USER.lastName,
        role: 'USER',
        status: 'ACTIVE',
        isAnonymous: false,
        isEmailVerified: true,
      },
      create: {
        email: TEST_USER.email,
        passwordHash: hashedPassword,
        firstName: TEST_USER.firstName,
        lastName: TEST_USER.lastName,
        role: 'USER',
        status: 'ACTIVE',
        isAnonymous: false,
        isEmailVerified: true,
      },
    });

    console.log('✅ Test user is ready:');
    console.log('   Email:', TEST_USER.email);
    console.log('   Password:', TEST_USER.password);
    console.log('   User ID:', user.id);
  } catch (error) {
    console.error('❌ Error creating test user:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
createTestUser();
