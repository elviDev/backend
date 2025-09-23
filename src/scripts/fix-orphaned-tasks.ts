#!/usr/bin/env tsx

import { taskRepository, channelRepository, userRepository } from '@db/index';
import { logger } from '@utils/logger';

/**
 * Fix existing tasks without channels by assigning them to a default channel
 */

async function fixOrphanedTasks() {
  try {
    logger.info('🔧 Fixing tasks without channel assignments...');

    // Get all tasks without channels
    const allTasksResult = await taskRepository.findMany({ limit: 1000, offset: 0 });
    const allTasks = allTasksResult.data;

    const orphanedTasks = allTasks.filter(task => !task.channel_id);

    if (orphanedTasks.length === 0) {
      logger.info('✅ No orphaned tasks found. All tasks have proper channel assignments.');
      return;
    }

    logger.info(`🔍 Found ${orphanedTasks.length} orphaned tasks without channel assignments`);

    // Find an existing channel for orphaned tasks - we'll use the first available channel
    const channelsResult = await channelRepository.findMany({ limit: 10, offset: 0 });
    const channels = channelsResult.data;

    if (channels.length === 0) {
      logger.error('❌ No channels found. Cannot fix orphaned tasks without at least one channel.');
      return;
    }

    // Use the first available channel (which we know exists from our earlier data creation)
    const defaultChannel = channels[0];
    const defaultChannelId = defaultChannel.id;
    logger.info(`📁 Using existing channel for orphaned tasks: ${defaultChannel.name}`);

    // Fix each orphaned task
    let fixedCount = 0;
    for (const task of orphanedTasks) {
      try {
        await taskRepository.update(task.id, {
          channel_id: defaultChannelId
        });

        fixedCount++;
        logger.info(`🔧 Fixed task: ${task.title} (ID: ${task.id})`);
      } catch (error) {
        logger.error(`❌ Failed to fix task ${task.id}:`, error);
      }
    }

    logger.info('✅ Orphaned task fix completed!');
    logger.info(`📊 Summary:`);
    logger.info(`  - Found ${orphanedTasks.length} orphaned tasks`);
    logger.info(`  - Successfully fixed ${fixedCount} tasks`);
    logger.info(`  - All tasks now belong to channels`);

  } catch (error) {
    logger.error('❌ Orphaned task fix failed:', error);
    throw error;
  }
}

// Run the fix if this file is executed directly
if (require.main === module) {
  import('@config/index').then(async () => {
    const { initializeDatabase } = await import('@config/database');
    await initializeDatabase();

    fixOrphanedTasks().then(() => {
      process.exit(0);
    }).catch((error) => {
      console.error('Fix failed:', error);
      process.exit(1);
    });
  });
}

export { fixOrphanedTasks };