#!/usr/bin/env tsx

import { config } from '@config/index';
import { userRepository } from '@db/index';
import { logger } from '@utils/logger';

/**
 * Cleanup script to delete all unverified user accounts
 * This allows reusing email addresses for testing after fixing email verification
 */

async function cleanupUnverifiedUsers() {
  try {
    logger.info('Starting cleanup of unverified user accounts...');

    // First, let's see how many unverified users we have
    const unverifiedUsers = await userRepository.findUnverifiedUsers();
    
    if (unverifiedUsers.length === 0) {
      logger.info('No unverified users found to cleanup');
      return;
    }

    logger.info(`Found ${unverifiedUsers.length} unverified users to delete:`);
    
    // Log the users that will be deleted (for confirmation)
    unverifiedUsers.forEach((user, index) => {
      logger.info(`${index + 1}. ${user.email} - Created: ${user.created_at} - Role: ${user.role}`);
    });

    // Delete all unverified users
    const deleteCount = await userRepository.deleteUnverifiedUsers();
    
    logger.info(`Successfully deleted ${deleteCount} unverified user accounts`);
    logger.info('Cleanup completed. These email addresses can now be reused for registration.');

  } catch (error) {
    logger.error({ error }, 'Failed to cleanup unverified users');
    throw error;
  }
}

// Check if the repository has the required methods, if not we'll add them
async function main() {
  try {
    await cleanupUnverifiedUsers();
    process.exit(0);
  } catch (error) {
    logger.error({ error }, 'Cleanup script failed');
    process.exit(1);
  }
}

// Only run if this script is executed directly
if (require.main === module) {
  main();
}

export { cleanupUnverifiedUsers };