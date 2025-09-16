#!/usr/bin/env tsx
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanupUnverifiedUsers = cleanupUnverifiedUsers;
const index_1 = require("@db/index");
const logger_1 = require("@utils/logger");
/**
 * Cleanup script to delete all unverified user accounts
 * This allows reusing email addresses for testing after fixing email verification
 */
async function cleanupUnverifiedUsers() {
    try {
        logger_1.logger.info('Starting cleanup of unverified user accounts...');
        // First, let's see how many unverified users we have
        const unverifiedUsers = await index_1.userRepository.findUnverifiedUsers();
        if (unverifiedUsers.length === 0) {
            logger_1.logger.info('No unverified users found to cleanup');
            return;
        }
        logger_1.logger.info(`Found ${unverifiedUsers.length} unverified users to delete:`);
        // Log the users that will be deleted (for confirmation)
        unverifiedUsers.forEach((user, index) => {
            logger_1.logger.info(`${index + 1}. ${user.email} - Created: ${user.created_at} - Role: ${user.role}`);
        });
        // Delete all unverified users
        const deleteCount = await index_1.userRepository.deleteUnverifiedUsers();
        logger_1.logger.info(`Successfully deleted ${deleteCount} unverified user accounts`);
        logger_1.logger.info('Cleanup completed. These email addresses can now be reused for registration.');
    }
    catch (error) {
        logger_1.logger.error({ error }, 'Failed to cleanup unverified users');
        throw error;
    }
}
// Check if the repository has the required methods, if not we'll add them
async function main() {
    try {
        await cleanupUnverifiedUsers();
        process.exit(0);
    }
    catch (error) {
        logger_1.logger.error({ error }, 'Cleanup script failed');
        process.exit(1);
    }
}
// Only run if this script is executed directly
if (require.main === module) {
    main();
}
//# sourceMappingURL=cleanup-unverified-users.js.map