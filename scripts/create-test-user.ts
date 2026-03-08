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
  role: 'patient',
};

async function createTestUser() {
  try {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: TEST_USER.email },
    });

    if (existingUser) {
      console.log('✅ Test user already exists:');
      console.log('   Email:', TEST_USER.email);
      console.log('   Password:', TEST_USER.password);
      return;
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(TEST_USER.password, 10);

    // Create the test user
    const user = await prisma.user.create({
      data: {
        email: TEST_USER.email,
        password: hashedPassword,
        firstName: TEST_USER.firstName,
        lastName: TEST_USER.lastName,
        role: TEST_USER.role as any,
        isAnonymous: false,
        isVerified: true,
      },
    });

    console.log('✅ Test user created successfully:');
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
