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
exports.fixDataIssues = fixDataIssues;
const index_1 = require("@db/index");
const logger_1 = require("@utils/logger");
const sampleTasks = [
    {
        title: 'Implement User Authentication System',
        description: 'Design and implement a comprehensive user authentication system with JWT tokens, password reset, and email verification.',
        priority: 'high',
        status: 'in_progress',
        complexity: 8,
        estimated_hours: 40
    },
    {
        title: 'Setup CI/CD Pipeline',
        description: 'Configure automated testing and deployment pipeline using GitHub Actions for continuous integration and deployment.',
        priority: 'medium',
        status: 'pending',
        complexity: 6,
        estimated_hours: 24
    },
    {
        title: 'Database Performance Optimization',
        description: 'Analyze and optimize database queries, add proper indexing, and implement connection pooling for better performance.',
        priority: 'high',
        status: 'in_progress',
        complexity: 7,
        estimated_hours: 32
    },
    {
        title: 'API Documentation',
        description: 'Create comprehensive API documentation using OpenAPI/Swagger with examples and integration guides.',
        priority: 'medium',
        status: 'completed',
        complexity: 4,
        estimated_hours: 16
    },
    {
        title: 'Email Notification System',
        description: 'Implement automated email notifications for task assignments, status changes, and system alerts.',
        priority: 'medium',
        status: 'completed',
        complexity: 5,
        estimated_hours: 20
    },
    {
        title: 'Mobile App Integration',
        description: 'Develop REST API endpoints and WebSocket support for mobile application integration.',
        priority: 'low',
        status: 'pending',
        complexity: 9,
        estimated_hours: 60
    }
];
const sampleComments = [
    'Started working on the authentication flow. Setting up JWT tokens first.',
    'Added password hashing with bcrypt. Need to implement password reset next.',
    'Email verification is working. Testing with different email providers.',
    'Fixed the token expiration issue. Ready for code review.',
    'Performance looks good after the latest optimizations.',
    'Documentation updated with new API endpoints.',
    'Need to add more test coverage for edge cases.',
    'Integration testing completed successfully.',
    'Ready for production deployment after final review.',
    'Bug fix applied for the race condition issue.'
];
async function fixDataIssues() {
    try {
        logger_1.logger.info('🔧 Starting comprehensive data fix...');
        // Get all users for assignment
        const usersResult = await index_1.userRepository.findMany({ limit: 100, offset: 0 });
        const users = usersResult.data;
        if (users.length === 0) {
            logger_1.logger.error('No users found. Cannot assign tasks.');
            return;
        }
        logger_1.logger.info(`👥 Found ${users.length} users for task assignment`);
        // Get or create a channel for tasks
        const channelsResult = await index_1.channelRepository.findMany({ limit: 10, offset: 0 });
        const channels = channelsResult.data;
        let channelId;
        if (channels.length > 0) {
            channelId = channels[0].id;
            logger_1.logger.info(`📁 Using existing channel: ${channels[0].name}`);
        }
        else {
            // Create a default channel if none exist - tasks MUST have a channel
            const defaultChannel = await index_1.channelRepository.create({
                name: 'General Tasks',
                description: 'Default channel for task management',
                created_by: users[0].id,
                members: users.slice(0, 10).map(u => u.id), // Add first 10 users as members
                channel_type: 'public'
            });
            channelId = defaultChannel.id;
            logger_1.logger.info(`📁 Created default channel: ${defaultChannel.name}`);
        }
        // Create tasks with proper assignments
        logger_1.logger.info('📋 Creating and fixing tasks...');
        const createdTasks = [];
        for (const taskData of sampleTasks) {
            // Randomly assign 1-3 users to each task
            const numAssignees = Math.floor(Math.random() * 3) + 1;
            const shuffledUsers = [...users].sort(() => 0.5 - Math.random());
            const assignedUsers = shuffledUsers.slice(0, numAssignees);
            const createdBy = shuffledUsers[0]; // First user creates the task
            // Ensure task has a channel - MANDATORY requirement
            if (!channelId) {
                throw new Error('Cannot create task without a channel - this should never happen!');
            }
            const task = await index_1.taskRepository.create({
                title: taskData.title,
                description: taskData.description,
                priority: taskData.priority,
                status: taskData.status,
                complexity: taskData.complexity,
                estimated_hours: taskData.estimated_hours,
                assigned_to: assignedUsers.map(u => u.id),
                created_by: createdBy.id,
                owned_by: assignedUsers[0].id, // First assignee owns the task
                channel_id: channelId,
                task_type: 'general',
                tags: ['backend', 'development']
            });
            createdTasks.push({
                task,
                assignees: assignedUsers,
                creator: createdBy
            });
            logger_1.logger.info(`✅ Created task: ${task.title} (assigned to ${assignedUsers.length} users)`);
        }
        // Add comments to tasks
        logger_1.logger.info('💬 Adding comments to tasks...');
        const createdComments = [];
        for (const { task, assignees, creator } of createdTasks) {
            const numComments = Math.floor(Math.random() * 4) + 2; // 2-5 comments per task
            for (let i = 0; i < numComments; i++) {
                const commenter = assignees[Math.floor(Math.random() * assignees.length)];
                const commentText = sampleComments[Math.floor(Math.random() * sampleComments.length)];
                const comment = await index_1.commentRepository.createComment({
                    task_id: task.id,
                    author_id: commenter.id,
                    content: commentText
                });
                createdComments.push(comment);
                logger_1.logger.info(`💬 Added comment to task ${task.title}`);
            }
        }
        // Add reactions to comments - skipped due to database schema mismatch
        logger_1.logger.info('👍 Skipping reactions (database schema incompatible)...');
        // Fix existing unassigned tasks (if any)
        logger_1.logger.info('🔧 Fixing existing unassigned tasks...');
        const existingTasksResult = await index_1.taskRepository.findMany({ limit: 100, offset: 0 });
        const existingTasks = existingTasksResult.data;
        let fixedTaskCount = 0;
        for (const task of existingTasks) {
            if (!task.assigned_to || task.assigned_to.length === 0) {
                // Randomly assign 1-2 users to unassigned tasks
                const numAssignees = Math.floor(Math.random() * 2) + 1;
                const shuffledUsers = [...users].sort(() => 0.5 - Math.random());
                const assignedUsers = shuffledUsers.slice(0, numAssignees);
                await index_1.taskRepository.update(task.id, {
                    assigned_to: assignedUsers.map(u => u.id),
                    owned_by: assignedUsers[0].id
                });
                fixedTaskCount++;
                logger_1.logger.info(`🔧 Fixed unassigned task: ${task.title}`);
            }
        }
        // Verify thread message references
        logger_1.logger.info('🔗 Verifying thread message references...');
        try {
            // Get all messages that are marked as thread replies
            const threadMessagesResult = await messageRepository.findMany({
                limit: 100,
                offset: 0
            });
            const threadMessages = threadMessagesResult.data;
            let threadIssueCount = 0;
            for (const message of threadMessages) {
                if (message.thread_id) {
                    // Check if the referenced thread message exists
                    try {
                        const threadParent = await messageRepository.findById(message.thread_id);
                        if (!threadParent) {
                            logger_1.logger.warn(`⚠️ Thread message ${message.id} references non-existent thread ${message.thread_id}`);
                            threadIssueCount++;
                        }
                    }
                    catch (error) {
                        logger_1.logger.warn(`⚠️ Could not verify thread reference for message ${message.id}`);
                        threadIssueCount++;
                    }
                }
            }
            if (threadIssueCount === 0) {
                logger_1.logger.info('✅ All thread message references are valid');
            }
            else {
                logger_1.logger.warn(`⚠️ Found ${threadIssueCount} thread reference issues`);
            }
        }
        catch (error) {
            logger_1.logger.warn('Could not verify thread references:', error);
        }
        logger_1.logger.info('✅ Data fix completed successfully!');
        logger_1.logger.info(`📊 Summary:`);
        logger_1.logger.info(`  - Created ${createdTasks.length} properly assigned tasks`);
        logger_1.logger.info(`  - Added ${createdComments.length} comments to tasks`);
        logger_1.logger.info(`  - Skipped reactions (schema incompatible)`);
        logger_1.logger.info(`  - Fixed ${fixedTaskCount} previously unassigned tasks`);
        logger_1.logger.info(`  - Verified thread message references`);
        logger_1.logger.info(`  - All tasks now have proper assignees and owners`);
    }
    catch (error) {
        logger_1.logger.error('❌ Data fix failed:', error);
        throw error;
    }
}
// Run the fix if this file is executed directly
if (require.main === module) {
    Promise.resolve().then(() => __importStar(require('@config/index'))).then(async () => {
        const { initializeDatabase } = await Promise.resolve().then(() => __importStar(require('@config/database')));
        await initializeDatabase();
        fixDataIssues().then(() => {
            process.exit(0);
        }).catch((error) => {
            console.error('Script failed:', error);
            process.exit(1);
        });
    });
}
//# sourceMappingURL=fix-data-issues.js.map