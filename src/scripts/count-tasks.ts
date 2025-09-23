#!/usr/bin/env tsx

import { taskRepository } from '@db/index';
import { logger } from '@utils/logger';

/**
 * Count total tasks in the database
 */

async function countTasks() {
  try {
    logger.info('📊 Counting total tasks in database...');

    // Get all tasks with a high limit to ensure we get everything
    const tasksResult = await taskRepository.findMany({ limit: 10000, offset: 0 });
    const tasks = tasksResult.data;
    const totalFromQuery = tasks.length;

    // Also check the total count from the pagination result
    const totalFromPagination = tasksResult.total;

    logger.info(`📈 Task Count Results:`);
    logger.info(`  - Tasks retrieved: ${totalFromQuery}`);
    logger.info(`  - Total from pagination: ${totalFromPagination}`);
    logger.info(`  - Has more pages: ${tasksResult.hasMore}`);

    // Breakdown by status
    const statusCounts = tasks.reduce((acc, task) => {
      acc[task.status] = (acc[task.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    logger.info(`📋 Tasks by Status:`);
    Object.entries(statusCounts).forEach(([status, count]) => {
      logger.info(`  - ${status}: ${count}`);
    });

    // Breakdown by channel
    const channelCounts = tasks.reduce((acc, task) => {
      const channelId = task.channel_id || 'NO_CHANNEL';
      acc[channelId] = (acc[channelId] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    logger.info(`📁 Tasks by Channel:`);
    Object.entries(channelCounts).forEach(([channelId, count]) => {
      logger.info(`  - ${channelId === 'NO_CHANNEL' ? 'NO CHANNEL' : channelId}: ${count}`);
    });

    // Check for tasks without channels
    const tasksWithoutChannels = tasks.filter(task => !task.channel_id);
    if (tasksWithoutChannels.length > 0) {
      logger.warn(`⚠️ Found ${tasksWithoutChannels.length} tasks without channels!`);
    } else {
      logger.info(`✅ All tasks have proper channel assignments`);
    }

    return {
      total: totalFromPagination,
      retrieved: totalFromQuery,
      hasMore: tasksResult.hasMore,
      statusBreakdown: statusCounts,
      channelBreakdown: channelCounts,
      orphanedTasks: tasksWithoutChannels.length
    };

  } catch (error) {
    logger.error('❌ Failed to count tasks:', error);
    throw error;
  }
}

// Run the count if this file is executed directly
if (require.main === module) {
  import('@config/index').then(async () => {
    const { initializeDatabase } = await import('@config/database');
    await initializeDatabase();

    countTasks().then((result) => {
      console.log(`\n📊 TOTAL TASKS: ${result.total}`);
      process.exit(0);
    }).catch((error) => {
      console.error('Count failed:', error);
      process.exit(1);
    });
  });
}

export { countTasks };