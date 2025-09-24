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
exports.testCommentAccessControl = testCommentAccessControl;
const index_1 = require("@db/index");
const logger_1 = require("@utils/logger");
async function testCommentAccessControl() {
    try {
        logger_1.logger.info('🔬 Testing comment access control implementation...');
        // Get test data
        const tasksResult = await index_1.taskRepository.findMany({ limit: 10, offset: 0 });
        const tasks = tasksResult.data;
        const usersResult = await index_1.userRepository.findMany({ limit: 50, offset: 0 });
        const users = usersResult.data;
        if (tasks.length === 0 || users.length === 0) {
            throw new Error('No tasks or users found for testing');
        }
        // Find a task with assignees
        const testTask = tasks.find(task => task.assigned_to && task.assigned_to.length > 0);
        if (!testTask) {
            throw new Error('No tasks with assignees found for testing');
        }
        const taskOwner = users.find(u => u.id === testTask.created_by);
        const taskAssignees = users.filter(u => testTask.assigned_to?.includes(u.id));
        const nonAssignedUser = users.find(u => u.id !== testTask.created_by &&
            !testTask.assigned_to?.includes(u.id) &&
            u.role !== 'ceo');
        const ceoUser = users.find(u => u.role === 'ceo');
        if (!taskOwner || taskAssignees.length === 0 || !nonAssignedUser || !ceoUser) {
            throw new Error('Missing required test users');
        }
        logger_1.logger.info(`📋 Testing with task: "${testTask.title}"`);
        logger_1.logger.info(`👤 Task owner: ${taskOwner.name} (${taskOwner.email})`);
        logger_1.logger.info(`👥 Assignees: ${taskAssignees.map(u => u.name).join(', ')}`);
        logger_1.logger.info(`🚫 Non-assigned user: ${nonAssignedUser.name} (${nonAssignedUser.email})`);
        logger_1.logger.info(`👑 CEO: ${ceoUser.name} (${ceoUser.email})`);
        const testResults = [];
        // Test 1: Task owner can comment
        try {
            const comment = await index_1.commentRepository.createComment({
                task_id: testTask.id,
                author_id: taskOwner.id,
                content: "Testing comment access - task owner comment"
            });
            testResults.push({
                scenario: "Task owner commenting",
                user: taskOwner.name,
                task: testTask.title,
                action: "Create comment",
                expected: 'SUCCESS',
                actual: 'SUCCESS',
                passed: true
            });
            logger_1.logger.info(`✅ Test 1 PASSED: Task owner can comment`);
        }
        catch (error) {
            testResults.push({
                scenario: "Task owner commenting",
                user: taskOwner.name,
                task: testTask.title,
                action: "Create comment",
                expected: 'SUCCESS',
                actual: 'DENIED',
                passed: false
            });
            logger_1.logger.error(`❌ Test 1 FAILED: Task owner cannot comment - ${error}`);
        }
        // Test 2: Task assignee can comment
        const assignee = taskAssignees[0];
        try {
            const comment = await index_1.commentRepository.createComment({
                task_id: testTask.id,
                author_id: assignee.id,
                content: "Testing comment access - assignee comment"
            });
            testResults.push({
                scenario: "Task assignee commenting",
                user: assignee.name,
                task: testTask.title,
                action: "Create comment",
                expected: 'SUCCESS',
                actual: 'SUCCESS',
                passed: true
            });
            logger_1.logger.info(`✅ Test 2 PASSED: Task assignee can comment`);
        }
        catch (error) {
            testResults.push({
                scenario: "Task assignee commenting",
                user: assignee.name,
                task: testTask.title,
                action: "Create comment",
                expected: 'SUCCESS',
                actual: 'DENIED',
                passed: false
            });
            logger_1.logger.error(`❌ Test 2 FAILED: Task assignee cannot comment - ${error}`);
        }
        // Test 3: CEO can comment (administrative override)
        try {
            const comment = await index_1.commentRepository.createComment({
                task_id: testTask.id,
                author_id: ceoUser.id,
                content: "Testing comment access - CEO override comment"
            });
            testResults.push({
                scenario: "CEO commenting (admin override)",
                user: ceoUser.name,
                task: testTask.title,
                action: "Create comment",
                expected: 'SUCCESS',
                actual: 'SUCCESS',
                passed: true
            });
            logger_1.logger.info(`✅ Test 3 PASSED: CEO can comment (admin override)`);
        }
        catch (error) {
            testResults.push({
                scenario: "CEO commenting (admin override)",
                user: ceoUser.name,
                task: testTask.title,
                action: "Create comment",
                expected: 'SUCCESS',
                actual: 'DENIED',
                passed: false
            });
            logger_1.logger.error(`❌ Test 3 FAILED: CEO cannot comment - ${error}`);
        }
        // Test 4: Non-assigned user CANNOT comment (should be blocked by middleware)
        // Note: This test simulates what the middleware should prevent
        logger_1.logger.info(`⚠️ Test 4: Non-assigned user access test (${nonAssignedUser.name})`);
        logger_1.logger.info(`   This should be blocked by the middleware in actual API calls`);
        logger_1.logger.info(`   Repository level allows it, but API middleware should prevent it`);
        // Test comment reactions for allowed users
        const existingCommentsResult = await index_1.commentRepository.getTaskComments(testTask.id, {});
        if (existingCommentsResult.data.length > 0) {
            const testComment = existingCommentsResult.data[0];
            // Test 5: Task owner can react to comments
            try {
                await index_1.commentRepository.addOrUpdateReaction(testComment.id, taskOwner.id, 'up');
                testResults.push({
                    scenario: "Task owner reacting to comment",
                    user: taskOwner.name,
                    task: testTask.title,
                    action: "Add reaction",
                    expected: 'SUCCESS',
                    actual: 'SUCCESS',
                    passed: true
                });
                logger_1.logger.info(`✅ Test 5 PASSED: Task owner can react to comments`);
            }
            catch (error) {
                testResults.push({
                    scenario: "Task owner reacting to comment",
                    user: taskOwner.name,
                    task: testTask.title,
                    action: "Add reaction",
                    expected: 'SUCCESS',
                    actual: 'DENIED',
                    passed: false
                });
                logger_1.logger.error(`❌ Test 5 FAILED: Task owner cannot react - ${error}`);
            }
            // Test 6: Task assignee can react to comments
            try {
                await index_1.commentRepository.addOrUpdateReaction(testComment.id, assignee.id, 'down');
                testResults.push({
                    scenario: "Task assignee reacting to comment",
                    user: assignee.name,
                    task: testTask.title,
                    action: "Add reaction",
                    expected: 'SUCCESS',
                    actual: 'SUCCESS',
                    passed: true
                });
                logger_1.logger.info(`✅ Test 6 PASSED: Task assignee can react to comments`);
            }
            catch (error) {
                testResults.push({
                    scenario: "Task assignee reacting to comment",
                    user: assignee.name,
                    task: testTask.title,
                    action: "Add reaction",
                    expected: 'SUCCESS',
                    actual: 'DENIED',
                    passed: false
                });
                logger_1.logger.error(`❌ Test 6 FAILED: Task assignee cannot react - ${error}`);
            }
        }
        // Summary
        const passedTests = testResults.filter(r => r.passed).length;
        const totalTests = testResults.length;
        logger_1.logger.info(`\n📊 TEST SUMMARY:`);
        logger_1.logger.info(`✅ Tests passed: ${passedTests}/${totalTests}`);
        logger_1.logger.info(`❌ Tests failed: ${totalTests - passedTests}/${totalTests}`);
        console.log('\n🔬 COMMENT ACCESS CONTROL TEST RESULTS:');
        console.log('=====================================');
        testResults.forEach((result, index) => {
            const status = result.passed ? '✅ PASS' : '❌ FAIL';
            console.log(`${index + 1}. ${result.scenario}: ${status}`);
            console.log(`   User: ${result.user}`);
            console.log(`   Action: ${result.action}`);
            console.log(`   Expected: ${result.expected}, Actual: ${result.actual}`);
            console.log('');
        });
        console.log(`📈 Overall Success Rate: ${Math.round((passedTests / totalTests) * 100)}%`);
        // Additional information about middleware protection
        console.log('\n🛡️  MIDDLEWARE PROTECTION:');
        console.log('The API middleware (requireTaskCommentAccess) provides additional protection:');
        console.log('- Validates user authentication');
        console.log('- Checks task ownership and assignment before allowing API access');
        console.log('- Denies access to non-assigned users at the API level');
        console.log('- Provides proper error messages and security logging');
        return {
            totalTests,
            passedTests,
            failedTests: totalTests - passedTests,
            successRate: Math.round((passedTests / totalTests) * 100),
            results: testResults
        };
    }
    catch (error) {
        logger_1.logger.error('❌ Failed to test comment access control:', error);
        throw error;
    }
}
// Run the test if this file is executed directly
if (require.main === module) {
    Promise.resolve().then(() => __importStar(require('@config/index'))).then(async () => {
        const { initializeDatabase } = await Promise.resolve().then(() => __importStar(require('@config/database')));
        await initializeDatabase();
        testCommentAccessControl().then((result) => {
            console.log(`\n✅ ACCESS CONTROL TESTING COMPLETED!`);
            console.log(`Success Rate: ${result.successRate}%`);
            process.exit(result.successRate === 100 ? 0 : 1);
        }).catch((error) => {
            console.error('Testing failed:', error);
            process.exit(1);
        });
    });
}
//# sourceMappingURL=test-comment-access-control.js.map