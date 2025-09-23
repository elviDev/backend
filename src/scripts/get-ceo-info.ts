#!/usr/bin/env tsx

import { userRepository } from '@db/index';
import { logger } from '@utils/logger';

/**
 * Get CEO user information including email and password hash
 */

async function getCEOInfo() {
  try {
    logger.info('🔍 Looking for CEO user...');

    // Get all users and filter for CEO role
    const usersResult = await userRepository.findMany({ limit: 100, offset: 0 });
    const users = usersResult.data;

    const ceoUsers = users.filter(user => user.role === 'ceo');

    if (ceoUsers.length === 0) {
      logger.warn('⚠️ No CEO users found!');
      return null;
    }

    if (ceoUsers.length > 1) {
      logger.warn(`⚠️ Multiple CEO users found: ${ceoUsers.length}`);
    }

    const ceo = ceoUsers[0];

    logger.info('👑 CEO User Found:');
    logger.info(`  - Name: ${ceo.name}`);
    logger.info(`  - Email: ${ceo.email}`);
    logger.info(`  - ID: ${ceo.id}`);
    logger.info(`  - Created: ${ceo.created_at}`);
    logger.info(`  - Phone: ${ceo.phone || 'Not set'}`);
    logger.info(`  - Department: ${ceo.department || 'Not set'}`);

    // Note: We should NOT expose password hashes for security reasons
    // But we can check if there's a default password pattern or provide guidance

    console.log('\n👑 CEO ACCOUNT INFORMATION:');
    console.log(`Name: ${ceo.name}`);
    console.log(`Email: ${ceo.email}`);
    console.log(`ID: ${ceo.id}`);
    console.log('\n🔐 PASSWORD SECURITY NOTE:');
    console.log('For security reasons, password hashes are not displayed.');
    console.log('If you need to reset the CEO password, please use the appropriate');
    console.log('password reset functionality or update the database directly.');

    return {
      name: ceo.name,
      email: ceo.email,
      id: ceo.id,
      phone: ceo.phone,
      department: ceo.department,
      created_at: ceo.created_at
    };

  } catch (error) {
    logger.error('❌ Failed to get CEO info:', error);
    throw error;
  }
}

// Run the check if this file is executed directly
if (require.main === module) {
  import('@config/index').then(async () => {
    const { initializeDatabase } = await import('@config/database');
    await initializeDatabase();

    getCEOInfo().then((result) => {
      if (result) {
        console.log(`\n✅ CEO account found: ${result.email}`);
      } else {
        console.log('\n❌ No CEO account found in database');
      }
      process.exit(0);
    }).catch((error) => {
      console.error('Script failed:', error);
      process.exit(1);
    });
  });
}

export { getCEOInfo };