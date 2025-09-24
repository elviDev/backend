#!/usr/bin/env tsx
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.testChannelEnforcement = testChannelEnforcement;
const index_1 = require("@db/index");
const logger_1 = require("@utils/logger");
/**
 * Test script to verify channel enforcement for tasks
 */
async function testChannelEnforcement() {
    try {
        logger_1.logger.info('🧪 Testing channel enforcement for tasks...');
        // Get a user for testing
        const usersResult = await index_1.userRepository.findMany({ limit: 1, offset: 0 });
        const users = usersResult.data;
        if (users.length === 0) {
            logger_1.logger.error('No users found for testing');
            return;
        }
        const testUser = users[0];
        logger_1.logger.info(`👤 Using test user: ${testUser.name}`);
        // Test 1: Try to create a task without channel_id (should fail)
        logger_1.logger.info('🧪 Test 1: Creating task without channel_id...');
        try {
            await index_1.taskRepository.createTask({
                title: 'Test Task Without Channel',
                description: 'This should fail',
                assigned_to: [testUser.id],
                created_by: testUser.id,
                owned_by: testUser.id,
                task_type: 'general',
                priority: 'medium'
                // Deliberately omitting channel_id to test enforcement
            });
            logger_1.logger.error('❌ Test 1 FAILED: Task was created without channel_id!');
        }
        catch (error) {
            logger_1.logger.info('✅ Test 1 PASSED: Task creation failed as expected without channel_id');
        }
        // Test 2: Create a task with valid channel_id (should succeed)
        logger_1.logger.info('🧪 Test 2: Creating task with valid channel_id...');
        const channelsResult = await index_1.channelRepository.findMany({ limit: 1, offset: 0 });
        const channels = channelsResult.data;
        if (channels.length === 0) {
            logger_1.logger.warn('No channels found for testing - creating a test channel');
            const testChannel = await index_1.channelRepository.create({
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
            const task = await index_1.taskRepository.createTask({
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
                logger_1.logger.info('✅ Test 2 PASSED: Task was created with proper channel_id');
            }
            else {
                logger_1.logger.error('❌ Test 2 FAILED: Task channel_id does not match expected value');
            }
        }
        catch (error) {
            logger_1.logger.error('❌ Test 2 FAILED: Task creation failed unexpectedly', error);
        }
        // Test 3: Verify existing tasks have channels
        logger_1.logger.info('🧪 Test 3: Checking all existing tasks have channels...');
        const tasksResult = await index_1.taskRepository.findMany({ limit: 100, offset: 0 });
        const tasks = tasksResult.data;
        let tasksWithoutChannels = 0;
        for (const task of tasks) {
            if (!task.channel_id) {
                tasksWithoutChannels++;
                logger_1.logger.warn(`⚠️ Task without channel found: ${task.id} - ${task.title}`);
            }
        }
        if (tasksWithoutChannels === 0) {
            logger_1.logger.info(`✅ Test 3 PASSED: All ${tasks.length} tasks have proper channel assignments`);
        }
        else {
            logger_1.logger.error(`❌ Test 3 FAILED: Found ${tasksWithoutChannels} tasks without channels`);
        }
        logger_1.logger.info('🧪 Channel enforcement tests completed!');
    }
    catch (error) {
        logger_1.logger.error('❌ Channel enforcement test failed:', error);
        throw error;
    }
}
// Run the test if this file is executed directly
if (require.main === module) {
    Promise.resolve().then(() => __importStar(require('@config/index'))).then(async () => {
        const { initializeDatabase } = await Promise.resolve().then(() => __importStar(require('@config/database')));
        await initializeDatabase();
        testChannelEnforcement().then(() => {
            process.exit(0);
        }).catch((error) => {
            console.error('Test failed:', error);
            process.exit(1);
        });
    });
}
//# sourceMappingURL=test-channel-enforcement.js.map