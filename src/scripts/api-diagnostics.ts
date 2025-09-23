#!/usr/bin/env tsx

import { taskRepository, channelRepository, userRepository } from '@db/index';
import { logger } from '@utils/logger';

/**
 * API Diagnostics - Check what data is available for frontend
 */

async function runDiagnostics() {
  try {
    logger.info('🔍 Running API diagnostics...');

    // Check database connection
    logger.info('📊 Database Status:');

    // Count users
    const usersResult = await userRepository.findMany({ limit: 100, offset: 0 });
    const users = usersResult.data;
    logger.info(`  - Users: ${users.length}`);

    // Count channels
    const channelsResult = await channelRepository.findMany({ limit: 100, offset: 0 });
    const channels = channelsResult.data;
    logger.info(`  - Channels: ${channels.length}`);

    // Count tasks
    const tasksResult = await taskRepository.findMany({ limit: 100, offset: 0 });
    const tasks = tasksResult.data;
    logger.info(`  - Tasks: ${tasks.length}`);

    // Show sample data for verification
    logger.info('📋 Sample Channels:');
    channels.slice(0, 3).forEach(channel => {
      logger.info(`  - ${channel.name} (ID: ${channel.id})`);
    });

    logger.info('📋 Sample Tasks:');
    tasks.slice(0, 3).forEach(task => {
      logger.info(`  - ${task.title} (Channel: ${task.channel_id})`);
    });

    // Check server configuration
    logger.info('⚙️ Server Configuration:');
    logger.info(`  - NODE_ENV: ${process.env.NODE_ENV}`);
    logger.info(`  - PORT: ${process.env.PORT}`);
    logger.info(`  - HOST: ${process.env.HOST}`);
    logger.info(`  - API_PREFIX: ${process.env.API_PREFIX}`);
    logger.info(`  - API_VERSION: ${process.env.API_VERSION}`);
    logger.info(`  - CORS_ORIGIN: ${process.env.CORS_ORIGIN}`);

    // Expected API endpoints
    const baseUrl = `http://${process.env.HOST || 'localhost'}:${process.env.PORT || 3000}${process.env.API_PREFIX || '/api'}/${process.env.API_VERSION || 'v1'}`;

    logger.info('🌐 Expected API Endpoints:');
    logger.info(`  - Base URL: ${baseUrl}`);
    logger.info(`  - Channels: GET ${baseUrl}/channels`);
    logger.info(`  - Tasks: GET ${baseUrl}/tasks`);
    logger.info(`  - Users: GET ${baseUrl}/users`);

    logger.info('✅ Diagnostics completed successfully!');

    return {
      users: users.length,
      channels: channels.length,
      tasks: tasks.length,
      baseUrl,
      sampleChannels: channels.slice(0, 3).map(c => ({ id: c.id, name: c.name })),
      sampleTasks: tasks.slice(0, 3).map(t => ({ id: t.id, title: t.title, channel_id: t.channel_id }))
    };

  } catch (error) {
    logger.error('❌ Diagnostics failed:', error);
    throw error;
  }
}

// Run diagnostics if this file is executed directly
if (require.main === module) {
  import('@config/index').then(async () => {
    const { initializeDatabase } = await import('@config/database');
    await initializeDatabase();

    runDiagnostics().then((result) => {
      console.log('\n📊 DIAGNOSTICS SUMMARY:');
      console.log(`Users: ${result.users}`);
      console.log(`Channels: ${result.channels}`);
      console.log(`Tasks: ${result.tasks}`);
      console.log(`API Base: ${result.baseUrl}`);
      process.exit(0);
    }).catch((error) => {
      console.error('Diagnostics failed:', error);
      process.exit(1);
    });
  });
}

export { runDiagnostics };