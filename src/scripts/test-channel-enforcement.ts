#!/usr/bin/env tsx

import { taskRepository, userRepository, channelRepository } from '@db/index';
import { logger } from '@utils/logger';

/**
 * Test script to verify channel enforcement for tasks
 */

async function testChannelEnforcement() {
  try {
    logger.info('🧪 Testing channel enforcement for tasks...');

    // Get a user for testing
    const usersResult = await userRepository.findMany({ limit: 1, offset: 0 });
    const users = usersResult.data;

    if (users.length === 0) {
      logger.error('No users found for testing');
      return;
    }

    const testUser = users[0];
    logger.info(`👤 Using test user: ${testUser.name}`);

    // Test 1: Try to create a task without channel_id (should fail)
    logger.info('🧪 Test 1: Creating task without channel_id...');
    try {
      await taskRepository.createTask({
        title: 'Test Task Without Channel',
        description: 'This should fail',
        assigned_to: [testUser.id],
        created_by: testUser.id,
        owned_by: testUser.id,
        task_type: 'general',
        priority: 'medium'
        // Deliberately omitting channel_id to test enforcement
      });
      logger.error('❌ Test 1 FAILED: Task was created without channel_id!');
    } catch (error) {
      logger.info('✅ Test 1 PASSED: Task creation failed as expected without channel_id');
    }

    // Test 2: Create a task with valid channel_id (should succeed)
    logger.info('🧪 Test 2: Creating task with valid channel_id...');
    const channelsResult = await channelRepository.findMany({ limit: 1, offset: 0 });
    const channels = channelsResult.data;

    if (channels.length === 0) {
      logger.warn('No channels found for testing - creating a test channel');
      const testChannel = await channelRepository.create({
        name: 'Test Channel',
        description: 'Channel for testing task enforcement',
        created_by: testUser.id,
        members: [testUser.id],
        channel_type: 'public'
      });
      channels.push(testChannel);
    }

    const testChannel = channels[0];

    try {
      const task = await taskRepository.createTask({
        title: 'Test Task With Channel',
        description: 'This should succeed',
        channel_id: testChannel.id,
        assigned_to: [testUser.id],
        created_by: testUser.id,
        owned_by: testUser.id,
        task_type: 'general',
        priority: 'medium'
      });

      if (task.channel_id === testChannel.id) {
        logger.info('✅ Test 2 PASSED: Task was created with proper channel_id');
      } else {
        logger.error('❌ Test 2 FAILED: Task channel_id does not match expected value');
      }
    } catch (error) {
      logger.error('❌ Test 2 FAILED: Task creation failed unexpectedly', error);
    }

    // Test 3: Verify existing tasks have channels
    logger.info('🧪 Test 3: Checking all existing tasks have channels...');
    const tasksResult = await taskRepository.findMany({ limit: 100, offset: 0 });
    const tasks = tasksResult.data;

    let tasksWithoutChannels = 0;
    for (const task of tasks) {
      if (!task.channel_id) {
        tasksWithoutChannels++;
        logger.warn(`⚠️ Task without channel found: ${task.id} - ${task.title}`);
      }
    }

    if (tasksWithoutChannels === 0) {
      logger.info(`✅ Test 3 PASSED: All ${tasks.length} tasks have proper channel assignments`);
    } else {
      logger.error(`❌ Test 3 FAILED: Found ${tasksWithoutChannels} tasks without channels`);
    }

    logger.info('🧪 Channel enforcement tests completed!');

  } catch (error) {
    logger.error('❌ Channel enforcement test failed:', error);
    throw error;
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  import('@config/index').then(async () => {
    const { initializeDatabase } = await import('@config/database');
    await initializeDatabase();

    testChannelEnforcement().then(() => {
      process.exit(0);
    }).catch((error) => {
      console.error('Test failed:', error);
      process.exit(1);
    });
  });
}

export { testChannelEnforcement };