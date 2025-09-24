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
exports.addStatusBasedComments = addStatusBasedComments;
const index_1 = require("@db/index");
const logger_1 = require("@utils/logger");
/**
 * Add status-specific comments to tasks that are not pending
 * This shows realistic activity progression based on task status
 */
const statusBasedComments = {
    in_progress: [
        "Started working on this task. Initial analysis complete.",
        "Making good progress on the implementation. About 30% done.",
        "Hit a small roadblock with the API integration, researching solutions.",
        "Found the solution! Moving forward with the implementation.",
        "Code is working locally, need to test in staging environment.",
        "Implementation is 70% complete. Should finish by end of week.",
        "Testing the edge cases now. Found a few minor issues to fix.",
        "Almost done! Just need to add error handling and logging.",
        "Ready for code review once I finish the documentation.",
        "Encountered an unexpected dependency issue, investigating.",
        "Performance looks good so far. Running additional tests.",
        "Integration with the existing system is working smoothly.",
    ],
    review: [
        "Task completed and ready for review. Please check my implementation.",
        "Code review requested. All tests are passing.",
        "Implementation is complete. Added comprehensive unit tests.",
        "Ready for QA testing. Documentation has been updated.",
        "Peer review completed. Addressing the feedback now.",
        "Fixed the issues mentioned in the code review.",
        "All review comments have been addressed. Ready for final approval.",
        "Added additional test cases as requested in the review.",
        "Refactored the code based on review feedback. Much cleaner now.",
        "Documentation updated to reflect the final implementation.",
        "Security review passed. No vulnerabilities found.",
        "Performance benchmarks meet the requirements.",
    ],
    completed: [
        "Task successfully completed! All requirements met.",
        "Deployed to production successfully. Monitoring for any issues.",
        "Completed ahead of schedule. Great team collaboration!",
        "All acceptance criteria have been met. Task closed.",
        "Feature is live and working perfectly. Users are happy!",
        "Completed with excellent test coverage. Very stable implementation.",
        "Delivered on time with all requested features included.",
        "Post-deployment monitoring shows everything is working well.",
        "Great results! This will significantly improve user experience.",
        "Task completed successfully. Documented lessons learned.",
        "Exceeded expectations! Added some bonus features too.",
        "Clean implementation with comprehensive error handling.",
    ],
    on_hold: [
        "Task put on hold pending client decision on requirements.",
        "Waiting for external API access. Following up with vendor.",
        "Blocked by infrastructure changes. Coordinating with DevOps.",
        "On hold due to budget approval delay. Should resume next month.",
        "Paused to prioritize critical bug fixes. Will resume soon.",
        "Waiting for legal approval on the data processing requirements.",
        "Dependencies not yet available. Tracking with project manager.",
        "Resource constraints. Will continue when team capacity allows.",
        "On hold pending security audit completion.",
        "Client requested changes to scope. Waiting for new requirements.",
    ],
    cancelled: [
        "Task cancelled due to change in business requirements.",
        "Scope changed significantly. Closing this and creating new task.",
        "No longer needed after process optimization.",
        "Cancelled - alternative solution was implemented instead.",
        "Business priorities shifted. Task is no longer relevant.",
    ]
};
const progressReplies = [
    "Thanks for the update! Keep up the great work.",
    "Looks good. Let me know if you need any help.",
    "Great progress! The timeline looks achievable.",
    "Thanks for keeping us informed on the status.",
    "Excellent work! The quality is very impressive.",
    "Good to see steady progress. Appreciate the detailed updates.",
    "Thanks for the transparency. This helps with planning.",
    "Impressive problem-solving! Great job working through the issues.",
    "The documentation looks comprehensive. Well done!",
    "Perfect! This is exactly what we needed.",
];
async function addStatusBasedComments() {
    try {
        logger_1.logger.info('🔄 Adding status-based comments to non-pending tasks...');
        // Get all tasks, focusing on non-pending ones
        const tasksResult = await index_1.taskRepository.findMany({ limit: 100, offset: 0 });
        const tasks = tasksResult.data;
        // Filter for non-pending tasks
        const nonPendingTasks = tasks.filter(task => task.status !== 'pending');
        // Get all users for comment authors
        const usersResult = await index_1.userRepository.findMany({ limit: 100, offset: 0 });
        const users = usersResult.data;
        logger_1.logger.info(`📊 Found ${nonPendingTasks.length} non-pending tasks out of ${tasks.length} total`);
        let commentsAdded = 0;
        let tasksProcessed = 0;
        for (const task of nonPendingTasks) {
            try {
                logger_1.logger.info(`💼 Processing ${task.status} task: "${task.title}"`);
                // Get task assignees and owner
                const taskOwner = users.find(u => u.id === task.created_by);
                const taskAssignees = users.filter(u => task.assigned_to?.includes(u.id));
                if (!taskOwner) {
                    logger_1.logger.warn(`⚠️ Task owner not found for task ${task.id}`);
                    continue;
                }
                // People who can comment on this task (owner + assignees)
                const allowedCommenters = [taskOwner, ...taskAssignees].filter((user, index, self) => user && self.findIndex(u => u?.id === user.id) === index);
                if (allowedCommenters.length === 0) {
                    logger_1.logger.warn(`⚠️ No valid commenters for task ${task.id}`);
                    continue;
                }
                // Get status-specific comments
                const statusComments = statusBasedComments[task.status] || [];
                if (statusComments.length === 0) {
                    logger_1.logger.warn(`⚠️ No status comments defined for status: ${task.status}`);
                    continue;
                }
                // Add 3-6 comments based on task status
                let numComments;
                switch (task.status) {
                    case 'completed':
                        numComments = Math.floor(Math.random() * 3) + 4; // 4-6 comments
                        break;
                    case 'review':
                        numComments = Math.floor(Math.random() * 2) + 3; // 3-4 comments
                        break;
                    case 'in_progress':
                        numComments = Math.floor(Math.random() * 3) + 3; // 3-5 comments
                        break;
                    case 'on_hold':
                        numComments = Math.floor(Math.random() * 2) + 2; // 2-3 comments
                        break;
                    default:
                        numComments = 2;
                }
                const usedComments = new Set();
                let primaryCommenter = allowedCommenters[0]; // Usually the assignee
                for (let i = 0; i < numComments; i++) {
                    // Pick a unique comment
                    let commentText;
                    do {
                        commentText = statusComments[Math.floor(Math.random() * statusComments.length)];
                    } while (usedComments.has(commentText) && usedComments.size < statusComments.length);
                    if (usedComments.has(commentText))
                        break; // No more unique comments available
                    usedComments.add(commentText);
                    // For the first comment, use primary assignee, then alternate
                    const commenter = i === 0 ? primaryCommenter : allowedCommenters[Math.floor(Math.random() * allowedCommenters.length)];
                    // Create the comment with realistic timestamp (older first)
                    const daysAgo = numComments - i; // Older comments first
                    const commentDate = new Date();
                    commentDate.setDate(commentDate.getDate() - daysAgo);
                    const comment = await index_1.commentRepository.createComment({
                        task_id: task.id,
                        author_id: commenter.id,
                        content: commentText,
                    });
                    commentsAdded++;
                    logger_1.logger.debug(`  ✅ Comment added by ${commenter.name}: "${commentText.substring(0, 50)}..."`);
                    // Add replies for completed and review tasks (show collaboration)
                    if ((task.status === 'completed' || task.status === 'review') && Math.random() > 0.6) {
                        const replier = allowedCommenters.find(u => u.id !== commenter.id) || taskOwner;
                        if (replier && progressReplies.length > 0) {
                            const replyText = progressReplies[Math.floor(Math.random() * progressReplies.length)];
                            await index_1.commentRepository.createComment({
                                task_id: task.id,
                                author_id: replier.id,
                                content: replyText,
                                parent_comment_id: comment.id,
                            });
                            commentsAdded++;
                            logger_1.logger.debug(`    ↳ Reply by ${replier.name}: "${replyText}"`);
                        }
                    }
                    // Add reactions to some comments (more for completed tasks)
                    const reactionChance = task.status === 'completed' ? 0.4 : task.status === 'review' ? 0.3 : 0.2;
                    if (Math.random() < reactionChance) {
                        try {
                            const reactor = allowedCommenters[Math.floor(Math.random() * allowedCommenters.length)];
                            if (reactor && reactor.id !== commenter.id) {
                                const reactions = ['up', 'down'];
                                const reaction = reactions[Math.floor(Math.random() * reactions.length)];
                                await index_1.commentRepository.addOrUpdateReaction(comment.id, reactor.id, reaction);
                                logger_1.logger.debug(`    👍 Reaction "${reaction}" by ${reactor.name}`);
                            }
                        }
                        catch (reactionError) {
                            logger_1.logger.debug(`Failed to add reaction: ${reactionError}`);
                        }
                    }
                }
                tasksProcessed++;
                logger_1.logger.info(`  ✅ Added ${numComments} comments to "${task.title}" (${task.status})`);
            }
            catch (error) {
                logger_1.logger.error(`❌ Failed to add comments to task ${task.id}:`, error);
            }
        }
        logger_1.logger.info(`\n🎉 Status-based commenting completed!`);
        logger_1.logger.info(`📊 Statistics:`);
        logger_1.logger.info(`  - Tasks processed: ${tasksProcessed}`);
        logger_1.logger.info(`  - Comments added: ${commentsAdded}`);
        logger_1.logger.info(`  - Task statuses covered: ${Object.keys(statusBasedComments).join(', ')}`);
        // Show status breakdown
        const statusBreakdown = nonPendingTasks.reduce((acc, task) => {
            acc[task.status] = (acc[task.status] || 0) + 1;
            return acc;
        }, {});
        logger_1.logger.info(`📈 Non-pending task breakdown:`);
        Object.entries(statusBreakdown).forEach(([status, count]) => {
            logger_1.logger.info(`  - ${status}: ${count} tasks`);
        });
        return {
            tasksProcessed,
            commentsAdded,
            statusBreakdown
        };
    }
    catch (error) {
        logger_1.logger.error('❌ Failed to add status-based comments:', error);
        throw error;
    }
}
// Run the script if this file is executed directly
if (require.main === module) {
    Promise.resolve().then(() => __importStar(require('@config/index'))).then(async () => {
        const { initializeDatabase } = await Promise.resolve().then(() => __importStar(require('@config/database')));
        await initializeDatabase();
        addStatusBasedComments().then((result) => {
            console.log(`\n✅ STATUS-BASED COMMENTS ADDED SUCCESSFULLY!`);
            console.log(`Tasks Processed: ${result.tasksProcessed}`);
            console.log(`Comments Added: ${result.commentsAdded}`);
            console.log(`\nStatus Breakdown:`);
            Object.entries(result.statusBreakdown).forEach(([status, count]) => {
                console.log(`  ${status}: ${count} tasks`);
            });
            process.exit(0);
        }).catch((error) => {
            console.error('Status-based commenting failed:', error);
            process.exit(1);
        });
    });
}
//# sourceMappingURL=add-status-based-comments.js.map