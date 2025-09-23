/**
 * Comprehensive Database Seeding Script
 * Clears all data and creates robust test data for thorough application testing
 */

import { query, initializeDatabase } from '../config/database';
import { logger } from '../utils/logger';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

interface TestUser {
  id: string;
  name: string;
  email: string;
  role: 'ceo' | 'manager' | 'staff';
  password: string;
}

interface TestChannel {
  id: string;
  name: string;
  description: string;
  channel_type: 'project' | 'department' | 'initiative' | 'temporary' | 'announcement';
  privacy_level: 'public' | 'private' | 'restricted';
  created_by: string;
}

interface TestMessage {
  id: string;
  channel_id: string;
  user_id: string;
  content: string;
  message_type: 'text' | 'voice' | 'file' | 'system';
  reply_to_id?: string;
  thread_root_id?: string;
}

class ComprehensiveSeeder {
  private users: TestUser[] = [];
  private channels: TestChannel[] = [];
  private messages: TestMessage[] = [];
  private tasks: any[] = [];

  async run() {
    try {
      logger.info('🚀 Starting comprehensive database seeding...');
      
      await initializeDatabase();
      
      // Step 1: Clear all data
      await this.clearAllData();
      
      // Step 2: Create users
      await this.createUsers();
      
      // Step 3: Create channels
      await this.createChannels();
      
      // Step 4: Create messages, threads, and replies
      await this.createMessagesAndThreads();
      
      // Step 5: Create tasks and comments
      await this.createTasksAndComments();
      
      // Step 6: Create reactions
      await this.createReactions();
      
      // Step 7: Create notifications and activities
      await this.createNotificationsAndActivities();
      
      await this.generateSummaryReport();
      
      logger.info('✅ Comprehensive seeding completed successfully!');
    } catch (error) {
      logger.error('❌ Seeding failed:', error);
      throw error;
    }
  }

  /**
   * Clear all data from all tables in correct order (respecting foreign keys)
   */
  private async clearAllData() {
    logger.info('🧹 Clearing all existing data...');
    
    const tables = [
      // Clear dependent tables first (only tables that actually exist)
      'comment_mentions',
      'task_comments', 
      'message_reactions',
      'activities',
      'notifications',
      'announcements',
      'voice_commands',
      'messages',
      'tasks',
      'channels',
      'categories',
      'users'
    ];

    for (const table of tables) {
      try {
        // Use TRUNCATE CASCADE to bypass triggers and clear all data
        await query(`TRUNCATE TABLE ${table} CASCADE`);
        logger.info(`  ✓ Cleared ${table}`);
      } catch (error) {
        // If TRUNCATE fails, try DELETE as fallback
        try {
          await query(`DELETE FROM ${table}`);
          logger.info(`  ✓ Cleared ${table} (fallback)`);
        } catch (deleteError) {
          logger.warn(`  ⚠️  Could not clear ${table}:`, error.message);
        }
      }
    }
    
    // Reset sequences (if they exist - most tables use UUIDs)
    try {
      await query(`SELECT setval(pg_get_serial_sequence('categories', 'id'), 1, false)`);
    } catch (error) {
      // Sequence might not exist, continue
    }
    
    logger.info('✅ Data clearing completed');
  }

  /**
   * Create 5 test users: 1 CEO, 2 Managers, 2 Staff
   */
  private async createUsers() {
    logger.info('👥 Creating test users...');
    
    const userData = [
      { name: 'Alex Johnson', email: 'alex.ceo@company.com', role: 'ceo' as const },
      { name: 'Sarah Manager', email: 'sarah.manager@company.com', role: 'manager' as const },
      { name: 'Mike Manager', email: 'mike.manager@company.com', role: 'manager' as const },
      { name: 'Emma Staff', email: 'emma.staff@company.com', role: 'staff' as const },
      { name: 'John Staff', email: 'john.staff@company.com', role: 'staff' as const },
    ];

    const hashedPassword = await bcrypt.hash('TestPass123!', 12);

    for (const user of userData) {
      const userId = uuidv4();
      
      await query(`
        INSERT INTO users (
          id, name, email, password_hash, role, phone, avatar_url, 
          email_verified, last_login, failed_login_attempts, login_count,
          created_at, updated_at, version
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW(), 1)
      `, [
        userId,
        user.name,
        user.email,
        hashedPassword,
        user.role,
        `+1-555-${Math.floor(Math.random() * 9000) + 1000}`,
        `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.name}`,
        true,
        new Date(),
        0,
        Math.floor(Math.random() * 20) + 1 // Random login count
      ]);

      this.users.push({
        id: userId,
        name: user.name,
        email: user.email,
        role: user.role,
        password: 'TestPass123!'
      });

      logger.info(`  ✓ Created ${user.role}: ${user.name} (${user.email})`);
    }
    
    logger.info(`✅ Created ${this.users.length} users`);
  }

  /**
   * Create 5 channels in different categories
   */
  private async createChannels() {
    logger.info('📂 Creating test channels...');

    const ceo = this.users.find(u => u.role === 'ceo')!;
    const managers = this.users.filter(u => u.role === 'manager');
    const staff = this.users.filter(u => u.role === 'staff');

    const channelsData = [
      {
        name: 'General Discussion',
        description: 'Main channel for company-wide discussions and announcements',
        channel_type: 'announcement' as const,
        privacy_level: 'public' as const,
        created_by: ceo.id,
        members: this.users.map(u => u.id)
      },
      {
        name: 'Project Phoenix',
        description: 'Development and coordination for our flagship project',
        channel_type: 'project' as const,
        privacy_level: 'private' as const,
        created_by: managers[0].id,
        members: [ceo.id, managers[0].id, staff[0].id, staff[1].id]
      },
      {
        name: 'Engineering Team',
        description: 'Technical discussions and development coordination',
        channel_type: 'department' as const,
        privacy_level: 'restricted' as const,
        created_by: managers[1].id,
        members: [ceo.id, managers[1].id, staff[0].id]
      },
      {
        name: 'Q4 Planning Initiative',
        description: 'Strategic planning for Q4 objectives and goals',
        channel_type: 'initiative' as const,
        privacy_level: 'restricted' as const,
        created_by: ceo.id,
        members: [ceo.id, ...managers.map(m => m.id)]
      },
      {
        name: 'Coffee & Chat',
        description: 'Casual conversations and team bonding',
        channel_type: 'temporary' as const,
        privacy_level: 'public' as const,
        created_by: staff[0].id,
        members: this.users.map(u => u.id)
      }
    ];

    for (const channelData of channelsData) {
      const channelId = uuidv4();
      
      // Create channel
      await query(`
        INSERT INTO channels (
          id, name, description, channel_type, privacy_level, created_by, owned_by,
          members, moderators, settings, project_info, activity_stats, 
          created_at, updated_at, version
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW(), 1)
      `, [
        channelId,
        channelData.name,
        channelData.description,
        channelData.channel_type,
        channelData.privacy_level,
        channelData.created_by,
        channelData.created_by, // owned_by is same as created_by initially
        channelData.members, // members array
        [channelData.created_by], // moderators array
        JSON.stringify({
          allow_voice_commands: true,
          allow_file_uploads: true,
          message_retention_days: 365,
          notification_level: 'all'
        }),
        JSON.stringify({
          priority: channelData.channel_type === 'announcement' ? 'high' : 'medium',
          tags: [channelData.channel_type]
        }),
        JSON.stringify({
          total_messages: 0,
          total_files: 0,
          total_tasks: 0
        })
      ]);

      // Update member count
      await query(`
        UPDATE channels SET member_count = $1 WHERE id = $2
      `, [channelData.members.length, channelId]);

      this.channels.push({
        id: channelId,
        name: channelData.name,
        description: channelData.description,
        channel_type: channelData.channel_type,
        privacy_level: channelData.privacy_level,
        created_by: channelData.created_by
      });

      logger.info(`  ✓ Created channel: ${channelData.name} (${channelData.channel_type})`);
    }
    
    logger.info(`✅ Created ${this.channels.length} channels`);
  }

  /**
   * Create messages, threads, and replies for each channel
   * Each channel gets: 5 messages, 3 threads (for 3 different messages), 6 replies total
   */
  private async createMessagesAndThreads() {
    logger.info('💬 Creating messages, threads, and replies...');

    const messageContents = [
      "Welcome to the team! Looking forward to working with everyone.",
      "Has anyone seen the latest design mockups? They look fantastic!",
      "Quick reminder: team meeting tomorrow at 2 PM in the conference room.",
      "Great job on the presentation today. The client was very impressed!",
      "I've updated the project timeline. Please review and let me know your thoughts.",
      "Coffee break anyone? I'm heading to the kitchen.",
      "The new deployment pipeline is working smoothly. No issues so far.",
      "Don't forget to submit your timesheets by Friday.",
      "Exciting news! We've reached our monthly targets ahead of schedule.",
      "Can someone help me with the API documentation? Having some issues."
    ];

    const threadReplies = [
      "Thanks for the warm welcome! Excited to contribute.",
      "I agree, the design team has outdone themselves this time.",
      "I'll be there! Any specific agenda items to prepare for?",
      "The client feedback was very positive indeed.",
      "Timeline looks good, but we might need more time for testing.",
      "I'll join you! Need my caffeine fix.",
      "That's great to hear! The automation is paying off.",
      "Already submitted mine yesterday.",
      "Fantastic work everyone! Let's keep this momentum going.",
      "I can help with that. Let's schedule a quick call."
    ];

    const directReplies = [
      "Absolutely! Welcome aboard.",
      "The color scheme is particularly well done.",
      "Count me in for the meeting.",
      "Hard work pays off!",
      "Good point about the testing phase.",
      "Perfect timing, I need coffee too.",
      "Deployment automation was a game-changer.",
      "Thanks for the reminder!",
      "Team effort at its finest.",
      "Happy to help anytime."
    ];

    let messageCounter = 0;
    let replyCounter = 0;

    for (const channel of this.channels) {
      logger.info(`  Creating content for channel: ${channel.name}`);
      
      // Create 5 messages for this channel
      const channelMessages: TestMessage[] = [];
      
      for (let i = 0; i < 5; i++) {
        const messageId = uuidv4();
        const user = this.users[Math.floor(Math.random() * this.users.length)];
        const content = messageContents[messageCounter % messageContents.length];
        
        await query(`
          INSERT INTO messages (
            id, channel_id, user_id, content, message_type, attachments, mentions,
            metadata, ai_generated, is_edited, is_pinned, is_announcement,
            created_at, updated_at, version
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW(), 1)
        `, [
          messageId,
          channel.id,
          user.id,
          content,
          'text',
          '{}', // attachments as empty JSONB
          '{}', // mentions as empty JSONB  
          '{}', // metadata as empty JSONB
          false,
          false,
          i === 0, // Pin the first message
          channel.channel_type === 'announcement' && i === 0
        ]);

        channelMessages.push({
          id: messageId,
          channel_id: channel.id,
          user_id: user.id,
          content,
          message_type: 'text'
        });

        messageCounter++;
      }

      // Create 3 threads on first 3 messages
      for (let threadIndex = 0; threadIndex < 3; threadIndex++) {
        const parentMessage = channelMessages[threadIndex];
        
        // Each thread gets 2 replies
        for (let replyIndex = 0; replyIndex < 2; replyIndex++) {
          const replyId = uuidv4();
          const user = this.users[Math.floor(Math.random() * this.users.length)];
          const content = threadReplies[replyCounter % threadReplies.length];
          
          await query(`
            INSERT INTO messages (
              id, channel_id, user_id, content, message_type, reply_to_id, thread_root_id,
              attachments, mentions, metadata, ai_generated, is_edited, is_pinned, is_announcement,
              created_at, updated_at, version
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW(), 1)
          `, [
            replyId,
            channel.id,
            user.id,
            content,
            'text',
            parentMessage.id,
            parentMessage.id, // Thread root is the original message
            '{}', // attachments as empty JSONB
            '{}', // mentions as empty JSONB
            '{}', // metadata as empty JSONB
            false,
            false,
            false,
            false
          ]);

          replyCounter++;
        }
      }

      // Create 2 direct replies (non-threaded) on messages 4 and 5
      for (let directIndex = 3; directIndex < 5; directIndex++) {
        const parentMessage = channelMessages[directIndex];
        const replyId = uuidv4();
        const user = this.users[Math.floor(Math.random() * this.users.length)];
        const content = directReplies[replyCounter % directReplies.length];
        
        await query(`
          INSERT INTO messages (
            id, channel_id, user_id, content, message_type, reply_to_id,
            attachments, mentions, metadata, ai_generated, is_edited, is_pinned, is_announcement,
            created_at, updated_at, version
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW(), 1)
        `, [
          replyId,
          channel.id,
          user.id,
          content,
          'text',
          parentMessage.id, // Direct reply, no thread_root_id
          '{}', // attachments as empty JSONB
          '{}', // mentions as empty JSONB
          '{}', // metadata as empty JSONB
          false,
          false,
          false,
          false
        ]);

        replyCounter++;
      }

      this.messages.push(...channelMessages);
    }
    
    logger.info(`✅ Created messages and threads for all channels`);
  }

  /**
   * Create 3 tasks per channel with 5 comments each
   */
  private async createTasksAndComments() {
    logger.info('📋 Creating tasks and comments...');

    const taskTitles = [
      "Setup development environment",
      "Implement user authentication",
      "Design database schema",
      "Create API documentation",
      "Setup CI/CD pipeline",
      "Conduct user testing",
      "Optimize application performance",
      "Review security measures",
      "Update project dependencies",
      "Plan next sprint",
      "Create user onboarding flow",
      "Implement data backup strategy",
      "Setup monitoring and alerts",
      "Prepare deployment checklist",
      "Update team documentation"
    ];

    const commentTexts = [
      "I'll start working on this right away.",
      "Do we have all the requirements for this task?",
      "This might take longer than expected due to complexity.",
      "I've made good progress, should be done by tomorrow.",
      "Can someone review my approach before I continue?",
      "I've encountered a blocker, need help with the database connection.",
      "Task completed! Ready for review.",
      "I think we need to adjust the timeline for this.",
      "Great job! This looks perfect.",
      "I have some concerns about the current approach.",
      "Let's discuss this in our next standup.",
      "I can help with testing once you're ready.",
      "Documentation needs to be updated as well.",
      "This integrates well with our existing systems.",
      "I suggest we add more error handling here.",
      "Performance looks good so far.",
      "Security review passed with minor suggestions.",
      "I'll update the stakeholders on our progress.",
      "We should consider adding automated tests.",
      "This feature will be very useful for users."
    ];

    let taskCounter = 0;
    let commentCounter = 0;

    for (const channel of this.channels) {
      logger.info(`  Creating tasks for channel: ${channel.name}`);
      
      // Create 3 tasks per channel
      for (let taskIndex = 0; taskIndex < 3; taskIndex++) {
        const taskId = uuidv4();
        const assignedUser = this.users[Math.floor(Math.random() * this.users.length)];
        const createdBy = this.users.find(u => u.role === 'ceo' || u.role === 'manager') || this.users[0];
        
        const task = {
          id: taskId,
          title: taskTitles[taskCounter % taskTitles.length],
          description: `Detailed description for ${taskTitles[taskCounter % taskTitles.length]}. This task is part of our ongoing efforts to improve the system.`,
          status: ['pending', 'in_progress', 'completed'][Math.floor(Math.random() * 3)],
          priority: ['low', 'medium', 'high'][Math.floor(Math.random() * 3)],
          assigned_to: assignedUser.id,
          created_by: createdBy.id,
          channel_id: channel.id
        };

        await query(`
          INSERT INTO tasks (
            id, title, description, status, priority, created_by, channel_id,
            owned_by, estimated_hours, due_date, custom_fields, created_at, updated_at, version
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW(), 1)
        `, [
          taskId,
          task.title,
          task.description,
          task.status,
          task.priority,
          task.created_by,
          task.channel_id,
          task.assigned_to, // Use as owned_by
          Math.floor(Math.random() * 20) + 1, // estimated_hours
          new Date(Date.now() + Math.random() * 30 * 24 * 60 * 60 * 1000), // Due in 0-30 days
          '{}' // custom_fields as empty JSONB
        ]);

        // Create 5 comments for each task
        for (let commentIndex = 0; commentIndex < 5; commentIndex++) {
          const commentId = uuidv4();
          const commentUser = this.users[Math.floor(Math.random() * this.users.length)];
          
          await query(`
            INSERT INTO task_comments (
              id, task_id, author_id, content, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, NOW(), NOW())
          `, [
            commentId,
            taskId,
            commentUser.id,
            commentTexts[commentCounter % commentTexts.length]
          ]);

          commentCounter++;
        }

        this.tasks.push(task);
        taskCounter++;
      }
    }
    
    logger.info(`✅ Created ${this.tasks.length} tasks with comments`);
  }

  /**
   * Add reactions to messages
   */
  private async createReactions() {
    logger.info('👍 Adding reactions to messages...');

    const emojis = ['👍', '❤️', '😊', '🎉', '👏', '🔥', '💯', '✅'];
    let reactionCount = 0;

    // Add reactions to random messages
    for (const message of this.messages) {
      // 70% chance to have reactions
      if (Math.random() < 0.7) {
        const numReactions = Math.floor(Math.random() * 3) + 1; // 1-3 reactions
        
        for (let i = 0; i < numReactions; i++) {
          const user = this.users[Math.floor(Math.random() * this.users.length)];
          const emoji = emojis[Math.floor(Math.random() * emojis.length)];
          
          try {
            await query(`
              INSERT INTO message_reactions (message_id, user_id, emoji, created_at)
              VALUES ($1, $2, $3, NOW())
            `, [message.id, user.id, emoji]);
            
            reactionCount++;
          } catch (error) {
            // Ignore duplicate reactions
          }
        }
      }
    }
    
    logger.info(`✅ Added ${reactionCount} reactions`);
  }

  /**
   * Generate notifications and activities for all users (minimum 5 each)
   */
  private async createNotificationsAndActivities() {
    logger.info('🔔 Creating notifications and activities...');

    const notificationTypes = [
      'message_mention',
      'task_assigned',
      'task_comment',
      'channel_invite',
      'message_reaction'
    ];

    const activityTypes = [
      'message_sent',
      'task_created',
      'task_completed',
      'channel_joined',
      'comment_added'
    ];

    for (const user of this.users) {
      // Create 5+ notifications for each user
      for (let i = 0; i < 6; i++) {
        const notificationId = uuidv4();
        const type = notificationTypes[Math.floor(Math.random() * notificationTypes.length)];
        const relatedMessage = this.messages[Math.floor(Math.random() * this.messages.length)];
        const relatedTask = this.tasks[Math.floor(Math.random() * this.tasks.length)];
        
        await query(`
          INSERT INTO notifications (
            id, user_id, type, title, content, data, is_read, priority,
            created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
        `, [
          notificationId,
          user.id,
          type,
          this.getNotificationTitle(type),
          this.getNotificationMessage(type, user.name),
          JSON.stringify({
            message_id: relatedMessage.id,
            task_id: relatedTask.id,
            channel_id: relatedMessage.channel_id
          }),
          Math.random() < 0.3, // 30% read
          ['low', 'medium', 'high'][Math.floor(Math.random() * 3)]
        ]);

        // Create corresponding activity
        const activityId = uuidv4();
        const activityType = activityTypes[Math.floor(Math.random() * activityTypes.length)];
        
        await query(`
          INSERT INTO activities (
            id, user_id, type, title, description, data,
            created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        `, [
          activityId,
          user.id,
          activityType,
          this.getActivityTitle(activityType),
          this.getActivityDescription(activityType, user.name),
          JSON.stringify({
            message_id: relatedMessage.id,
            task_id: relatedTask.id,
            channel_id: relatedMessage.channel_id
          })
        ]);
      }
    }
    
    logger.info(`✅ Created notifications and activities for all users`);
  }

  private getNotificationTitle(type: string): string {
    const titles = {
      message_mention: 'You were mentioned',
      task_assigned: 'New task assigned',
      task_comment: 'New comment on your task',
      channel_invite: 'Channel invitation',
      message_reaction: 'Someone reacted to your message'
    };
    return titles[type] || 'Notification';
  }

  private getNotificationMessage(type: string, userName: string): string {
    const messages = {
      message_mention: `${userName} mentioned you in a message`,
      task_assigned: `A new task has been assigned to you`,
      task_comment: `${userName} commented on your task`,
      channel_invite: `You've been invited to join a channel`,
      message_reaction: `${userName} reacted to your message`
    };
    return messages[type] || 'You have a new notification';
  }

  private getActivityTitle(type: string): string {
    const titles = {
      message_sent: 'Message sent',
      task_created: 'Task created',
      task_completed: 'Task completed',
      channel_joined: 'Joined channel',
      comment_added: 'Comment added'
    };
    return titles[type] || 'Activity';
  }

  private getActivityDescription(type: string, userName: string): string {
    const descriptions = {
      message_sent: `${userName} sent a message`,
      task_created: `${userName} created a new task`,
      task_completed: `${userName} completed a task`,
      channel_joined: `${userName} joined a channel`,
      comment_added: `${userName} added a comment`
    };
    return descriptions[type] || 'User activity recorded';
  }

  /**
   * Generate a summary report of all created data
   */
  private async generateSummaryReport() {
    logger.info('📊 Generating summary report...');

    const stats = {
      users: (await query('SELECT COUNT(*) as count FROM users')).rows[0].count,
      channels: (await query('SELECT COUNT(*) as count FROM channels')).rows[0].count,
      messages: (await query('SELECT COUNT(*) as count FROM messages')).rows[0].count,
      tasks: (await query('SELECT COUNT(*) as count FROM tasks')).rows[0].count,
      comments: (await query('SELECT COUNT(*) as count FROM task_comments')).rows[0].count,
      reactions: (await query('SELECT COUNT(*) as count FROM message_reactions')).rows[0].count,
      notifications: (await query('SELECT COUNT(*) as count FROM notifications')).rows[0].count,
      activities: (await query('SELECT COUNT(*) as count FROM activities')).rows[0].count,
      threads: (await query('SELECT COUNT(*) as count FROM messages WHERE thread_root_id IS NOT NULL')).rows[0].count,
      directReplies: (await query('SELECT COUNT(*) as count FROM messages WHERE reply_to_id IS NOT NULL AND thread_root_id IS NULL')).rows[0].count
    };

    logger.info('\n📋 SEEDING SUMMARY REPORT');
    logger.info('========================');
    logger.info(`👥 Users: ${stats.users} (1 CEO, 2 Managers, 2 Staff)`);
    logger.info(`📂 Channels: ${stats.channels} (different categories)`);
    logger.info(`💬 Messages: ${stats.messages} total`);
    logger.info(`🧵 Thread Replies: ${stats.threads}`);
    logger.info(`↩️  Direct Replies: ${stats.directReplies}`);
    logger.info(`📋 Tasks: ${stats.tasks} (3 per channel)`);
    logger.info(`💭 Comments: ${stats.comments} (5 per task)`);
    logger.info(`👍 Reactions: ${stats.reactions}`);
    logger.info(`🔔 Notifications: ${stats.notifications} (5+ per user)`);
    logger.info(`📈 Activities: ${stats.activities} (5+ per user)`);
    logger.info('========================\n');

    // User details
    logger.info('👥 USER ACCOUNTS:');
    for (const user of this.users) {
      logger.info(`  ${user.role.toUpperCase()}: ${user.name} (${user.email}) - Password: ${user.password}`);
    }

    // Channel details  
    logger.info('\n📂 CHANNELS:');
    for (const channel of this.channels) {
      logger.info(`  ${channel.name} (${channel.channel_type}) - ${channel.privacy_level}`);
    }

    logger.info('\n✅ Database is ready for comprehensive testing!');
  }
}

// Run the seeding script
if (require.main === module) {
  const seeder = new ComprehensiveSeeder();
  seeder.run()
    .then(() => {
      logger.info('🎉 Comprehensive seeding completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('💥 Seeding failed:', error);
      process.exit(1);
    });
}

export default ComprehensiveSeeder;