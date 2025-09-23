#!/usr/bin/env tsx

import { taskRepository, commentRepository, userRepository } from '@db/index';
import { logger } from '@utils/logger';

/**
 * Add comments and reactions to existing tasks to test access control
 */

const sampleComments = [
  "Great work on this task! Let me know if you need any help.",
  "I've reviewed the requirements and they look good to proceed.",
  "Can we schedule a meeting to discuss the implementation details?",
  "The deadline looks tight, should we extend it by a few days?",
  "I'll start working on this task today and provide updates.",
  "This is more complex than expected, might need additional resources.",
  "Task completed successfully! Ready for review.",
  "I have some concerns about the approach, let's discuss.",
  "Good progress so far, keep up the excellent work!",
  "This task is blocked by another dependency, please check.",
  "I've added the documentation as requested.",
  "The testing phase revealed some issues that need fixing.",
  "Client feedback has been incorporated into the task.",
  "This task requires CEO approval before proceeding.",
  "I've coordinated with other team members on this.",
];

const commentReplies = [
  "Thanks for the feedback! I'll incorporate these changes.",
  "Agreed, let's schedule that meeting for tomorrow.",
  "I'll handle the deadline extension request.",
  "Good point, let me revise the approach.",
  "Thanks for the approval, proceeding now.",
  "I'll address those testing issues today.",
  "Coordination looks good, we're aligned.",
  "The documentation has been updated accordingly.",
  "I'll prepare the materials for the CEO review.",
  "Dependencies are now resolved, proceeding.",
];

async function addTaskComments() {
  try {
    logger.info('🔄 Adding comments and reactions to tasks...');

    // Get all tasks
    const tasksResult = await taskRepository.findMany({ limit: 100, offset: 0 });
    const tasks = tasksResult.data;

    // Get all users for comment authors
    const usersResult = await userRepository.findMany({ limit: 100, offset: 0 });
    const users = usersResult.data;

    logger.info(`📊 Found ${tasks.length} tasks and ${users.length} users`);

    let commentsAdded = 0;
    let reactionsAdded = 0;

    for (const task of tasks.slice(0, 20)) { // Add comments to first 20 tasks
      try {
        logger.info(`💬 Adding comments to task: ${task.title}`);

        // Get task assignees and owner
        const taskOwner = users.find(u => u.id === task.created_by);
        const taskAssignees = users.filter(u => task.assigned_to?.includes(u.id));

        if (!taskOwner) {
          logger.warn(`⚠️ Task owner not found for task ${task.id}`);
          continue;
        }

        // People who can comment on this task (owner + assignees)
        const allowedCommenters = [taskOwner, ...taskAssignees].filter((user, index, self) =>
          user && self.findIndex(u => u?.id === user.id) === index
        );

        if (allowedCommenters.length === 0) {
          logger.warn(`⚠️ No valid commenters for task ${task.id}`);
          continue;
        }

        // Add 2-4 comments per task
        const numComments = Math.floor(Math.random() * 3) + 2;
        const usedComments = new Set<string>();

        for (let i = 0; i < numComments; i++) {
          // Pick a random commenter from allowed list
          const commenter = allowedCommenters[Math.floor(Math.random() * allowedCommenters.length)];

          // Pick a unique comment
          let commentText: string;
          do {
            commentText = sampleComments[Math.floor(Math.random() * sampleComments.length)];
          } while (usedComments.has(commentText));
          usedComments.add(commentText);

          // Create the comment
          const comment = await commentRepository.createComment({
            task_id: task.id,
            author_id: commenter!.id,
            content: commentText,
          });

          commentsAdded++;
          logger.debug(`  ✅ Comment added by ${commenter!.name}: "${commentText.substring(0, 40)}..."`);

          // 50% chance to add a reply from another allowed commenter
          if (Math.random() > 0.5 && allowedCommenters.length > 1) {
            const replier = allowedCommenters.find(u => u!.id !== commenter!.id);
            if (replier) {
              const replyText = commentReplies[Math.floor(Math.random() * commentReplies.length)];

              await commentRepository.createComment({
                task_id: task.id,
                author_id: replier.id,
                content: replyText,
                parent_comment_id: comment.id,
              });

              commentsAdded++;
              logger.debug(`    ↳ Reply by ${replier.name}: "${replyText.substring(0, 30)}..."`);
            }
          }

          // Add reactions to the comment (30% chance)
          if (Math.random() > 0.7) {
            try {
              // Pick a random user from allowed commenters to react
              const reactor = allowedCommenters[Math.floor(Math.random() * allowedCommenters.length)];
              if (reactor && reactor.id !== commenter!.id) {
                const reactions = ['up', 'down', 'thumbs_up', 'thumbs_down'] as const;
                const reaction = reactions[Math.floor(Math.random() * reactions.length)];

                await commentRepository.addOrUpdateReaction(comment.id, reactor.id, reaction);
                reactionsAdded++;
                logger.debug(`    👍 Reaction "${reaction}" by ${reactor.name}`);
              }
            } catch (reactionError) {
              logger.warn(`Failed to add reaction: ${reactionError}`);
            }
          }
        }

        logger.info(`  ✅ Added ${numComments} comments to "${task.title}"`);

      } catch (error) {
        logger.error(`❌ Failed to add comments to task ${task.id}:`, error);
      }
    }

    logger.info(`\n🎉 Comment seeding completed!`);
    logger.info(`📊 Statistics:`);
    logger.info(`  - Comments added: ${commentsAdded}`);
    logger.info(`  - Reactions added: ${reactionsAdded}`);
    logger.info(`  - Tasks with comments: ${Math.min(20, tasks.length)}`);

    return {
      commentsAdded,
      reactionsAdded,
      tasksProcessed: Math.min(20, tasks.length)
    };

  } catch (error) {
    logger.error('❌ Failed to add task comments:', error);
    throw error;
  }
}

// Run the script if this file is executed directly
if (require.main === module) {
  import('@config/index').then(async () => {
    const { initializeDatabase } = await import('@config/database');
    await initializeDatabase();

    addTaskComments().then((result) => {
      console.log(`\n✅ TASK COMMENTS SEEDED SUCCESSFULLY!`);
      console.log(`Comments: ${result.commentsAdded}`);
      console.log(`Reactions: ${result.reactionsAdded}`);
      console.log(`Tasks: ${result.tasksProcessed}`);
      process.exit(0);
    }).catch((error) => {
      console.error('Seeding failed:', error);
      process.exit(1);
    });
  });
}

export { addTaskComments };