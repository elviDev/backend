#!/usr/bin/env tsx

import { userRepository } from '@db/index';
import { logger } from '@utils/logger';

/**
 * Development script to manually verify email tokens
 * Useful when emails are logged to console instead of sent
 */

async function verifyEmailToken(token: string) {
  try {
    logger.info(`Attempting to verify email with token: ${token}`);

    const user = await userRepository.verifyEmail(token);
    
    if (user) {
      logger.info({
        userId: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      }, 'Email verified successfully! User can now log in.');
      
      console.log('\n✅ EMAIL VERIFICATION SUCCESSFUL!');
      console.log(`User: ${user.name} (${user.email})`);
      console.log(`Role: ${user.role}`);
      console.log('The user can now log in to the application.\n');
    } else {
      logger.warn('Invalid or expired verification token');
      console.log('\n❌ VERIFICATION FAILED!');
      console.log('Token is either invalid or expired.\n');
    }

  } catch (error) {
    logger.error({ error, token }, 'Failed to verify email token');
    console.log('\n❌ VERIFICATION ERROR!');
    console.log(`Error: ${error instanceof Error ? error.message : 'Unknown error'}\n`);
  }
}

// Get token from command line argument
const token = process.argv[2];

if (!token) {
  console.log('\n📧 Email Token Verification Tool');
  console.log('Usage: npx tsx src/scripts/verify-email-token.ts <TOKEN>');
  console.log('\nExample:');
  console.log('npx tsx src/scripts/verify-email-token.ts eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...\n');
  process.exit(1);
}

// Initialize database connection and verify token
import('@config/index').then(() => {
  verifyEmailToken(token).then(() => {
    process.exit(0);
  }).catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });
});