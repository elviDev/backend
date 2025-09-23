#!/usr/bin/env tsx

import { query, initializeDatabase } from '@config/database';
import { logger } from '@utils/logger';

/**
 * Check account status and clear any lockouts
 */

async function checkAndClearAccountStatus() {
  try {
    await initializeDatabase();
    logger.info('🔍 Checking CEO account status...');

    // Check current status
    const result = await query(`
      SELECT
        id, email, name, role,
        failed_login_attempts,
        account_locked_until,
        CASE
          WHEN account_locked_until IS NULL THEN 'UNLOCKED'
          WHEN account_locked_until > NOW() THEN 'LOCKED'
          ELSE 'UNLOCKED'
        END as lock_status
      FROM users
      WHERE email = 'alex.ceo@company.com'
      AND deleted_at IS NULL
    `);

    if (result.rows.length === 0) {
      console.log('❌ CEO user not found!');
      return;
    }

    const user = result.rows[0];

    console.log('\n👑 CEO ACCOUNT STATUS:');
    console.log(`Email: ${user.email}`);
    console.log(`Name: ${user.name}`);
    console.log(`Role: ${user.role}`);
    console.log(`Failed Attempts: ${user.failed_login_attempts}`);
    console.log(`Locked Until: ${user.account_locked_until || 'Not locked'}`);
    console.log(`Status: ${user.lock_status}`);

    // If locked, force unlock
    if (user.lock_status === 'LOCKED' || user.failed_login_attempts > 0) {
      console.log('\n🔧 Clearing account lockout...');

      await query(`
        UPDATE users
        SET failed_login_attempts = 0,
            account_locked_until = NULL
        WHERE email = 'alex.ceo@company.com'
      `);

      console.log('✅ Account lockout cleared!');
    }

    console.log('\n🎯 FINAL STATUS: READY FOR LOGIN');
    console.log('Login Credentials:');
    console.log('Email: alex.ceo@company.com');
    console.log('Password: TestPass123!');

  } catch (error) {
    logger.error('❌ Failed to check account status:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  checkAndClearAccountStatus()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('Check failed:', error);
      process.exit(1);
    });
}

export { checkAndClearAccountStatus };