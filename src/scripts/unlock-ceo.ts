#!/usr/bin/env tsx

import { userRepository } from '@db/index';
import { logger } from '@utils/logger';

/**
 * Unlock CEO account if it's locked
 */

async function unlockCEOAccount() {
  try {
    logger.info('🔓 Unlocking CEO account...');

    // Find CEO user
    const usersResult = await userRepository.findMany({ limit: 100, offset: 0 });
    const users = usersResult.data;
    const ceoUser = users.find(user => user.role === 'ceo');

    if (!ceoUser) {
      logger.error('❌ CEO user not found!');
      return false;
    }

    logger.info(`👑 Found CEO: ${ceoUser.name} (${ceoUser.email})`);

    // Check if account is locked
    if (ceoUser.account_locked_until && ceoUser.account_locked_until > new Date()) {
      logger.warn(`🔒 Account is locked until: ${ceoUser.account_locked_until}`);
      logger.info(`📊 Failed login attempts: ${ceoUser.failed_login_attempts}`);

      // Unlock the account
      const unlocked = await userRepository.unlockAccount(ceoUser.id);

      if (unlocked) {
        logger.info('✅ CEO account unlocked successfully!');
        console.log('\n✅ CEO ACCOUNT UNLOCKED');
        console.log('You can now login with:');
        console.log('Email: alex.ceo@company.com');
        console.log('Password: TestPass123!');
        return true;
      } else {
        logger.error('❌ Failed to unlock CEO account');
        return false;
      }
    } else {
      logger.info('✅ CEO account is not locked');
      console.log('\n✅ CEO ACCOUNT STATUS: UNLOCKED');
      console.log('You can login with:');
      console.log('Email: alex.ceo@company.com');
      console.log('Password: TestPass123!');
      return true;
    }

  } catch (error) {
    logger.error('❌ Failed to unlock CEO account:', error);
    throw error;
  }
}

// Run the script if this file is executed directly
if (require.main === module) {
  import('@config/index').then(async () => {
    const { initializeDatabase } = await import('@config/database');
    await initializeDatabase();

    unlockCEOAccount().then((success) => {
      process.exit(success ? 0 : 1);
    }).catch((error) => {
      console.error('Script failed:', error);
      process.exit(1);
    });
  });
}

export { unlockCEOAccount };