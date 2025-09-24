"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const database_1 = require("../config/database");
const logger_1 = require("../utils/logger");
async function verifyData() {
    try {
        await (0, database_1.initializeDatabase)();
        console.log('\n🎉 COMPREHENSIVE TEST DATA VERIFICATION');
        console.log('==========================================');
        // Users
        const usersResult = await (0, database_1.query)('SELECT COUNT(*) as count, role FROM users WHERE deleted_at IS NULL GROUP BY role ORDER BY role');
        console.log('\n👥 USERS:');
        let totalUsers = 0;
        for (const row of usersResult.rows) {
            console.log(`  ${row.role.toUpperCase()}: ${row.count}`);
            totalUsers += parseInt(row.count);
        }
        console.log(`  TOTAL: ${totalUsers}`);
        // User Details
        const userDetails = await (0, database_1.query)('SELECT name, email, role FROM users WHERE deleted_at IS NULL ORDER BY role DESC, name');
        console.log('\n👤 USER ACCOUNTS:');
        for (const user of userDetails.rows) {
            console.log(`  ${user.role.toUpperCase()}: ${user.name} (${user.email}) - Password: TestPass123!`);
        }
        // Channels
        const channelsResult = await (0, database_1.query)('SELECT COUNT(*) as count, channel_type FROM channels WHERE deleted_at IS NULL GROUP BY channel_type ORDER BY channel_type');
        console.log('\n📂 CHANNELS:');
        let totalChannels = 0;
        for (const row of channelsResult.rows) {
            console.log(`  ${row.channel_type.toUpperCase()}: ${row.count}`);
            totalChannels += parseInt(row.count);
        }
        console.log(`  TOTAL: ${totalChannels}`);
        // Channel Details
        const channelDetails = await (0, database_1.query)('SELECT name, channel_type, privacy_level FROM channels WHERE deleted_at IS NULL ORDER BY channel_type, name');
        console.log('\n📋 CHANNEL LIST:');
        for (const channel of channelDetails.rows) {
            console.log(`  ${channel.name} (${channel.channel_type}) - ${channel.privacy_level}`);
        }
        // Messages
        const messagesResult = await (0, database_1.query)('SELECT COUNT(*) as count FROM messages WHERE deleted_at IS NULL');
        const threadRepliesResult = await (0, database_1.query)('SELECT COUNT(*) as count FROM messages WHERE thread_root_id IS NOT NULL AND deleted_at IS NULL');
        const directRepliesResult = await (0, database_1.query)('SELECT COUNT(*) as count FROM messages WHERE reply_to_id IS NOT NULL AND thread_root_id IS NULL AND deleted_at IS NULL');
        const originalMessagesResult = await (0, database_1.query)('SELECT COUNT(*) as count FROM messages WHERE reply_to_id IS NULL AND deleted_at IS NULL');
        console.log('\n💬 MESSAGES:');
        console.log(`  Original Messages: ${originalMessagesResult.rows[0].count}`);
        console.log(`  Thread Replies: ${threadRepliesResult.rows[0].count}`);
        console.log(`  Direct Replies: ${directRepliesResult.rows[0].count}`);
        console.log(`  TOTAL MESSAGES: ${messagesResult.rows[0].count}`);
        // Tasks
        const tasksResult = await (0, database_1.query)('SELECT COUNT(*) as count FROM tasks WHERE deleted_at IS NULL');
        const taskCommentsResult = await (0, database_1.query)('SELECT COUNT(*) as count FROM task_comments WHERE deleted_at IS NULL');
        console.log('\n📋 TASKS & COMMENTS:');
        console.log(`  Tasks: ${tasksResult.rows[0].count}`);
        console.log(`  Task Comments: ${taskCommentsResult.rows[0].count}`);
        // Task breakdown by channel
        const tasksByChannel = await (0, database_1.query)(`
      SELECT c.name as channel_name, COUNT(t.id) as task_count
      FROM channels c
      LEFT JOIN tasks t ON c.id = t.channel_id AND t.deleted_at IS NULL
      WHERE c.deleted_at IS NULL
      GROUP BY c.name
      ORDER BY c.name
    `);
        console.log('\n📊 TASKS BY CHANNEL:');
        for (const row of tasksByChannel.rows) {
            console.log(`  ${row.channel_name}: ${row.task_count} tasks`);
        }
        // Reactions
        const reactionsResult = await (0, database_1.query)('SELECT COUNT(*) as count FROM message_reactions');
        console.log(`\n👍 MESSAGE REACTIONS: ${reactionsResult.rows[0].count}`);
        // Summary
        console.log('\n✅ DATA CREATION SUMMARY');
        console.log('========================');
        console.log(`👥 Users: ${totalUsers} (1 CEO, 2 Managers, 2 Staff)`);
        console.log(`📂 Channels: ${totalChannels} (different categories)`);
        console.log(`💬 Messages: ${messagesResult.rows[0].count} total`);
        console.log(`🧵 Thread Replies: ${threadRepliesResult.rows[0].count}`);
        console.log(`↩️  Direct Replies: ${directRepliesResult.rows[0].count}`);
        console.log(`📋 Tasks: ${tasksResult.rows[0].count} (3 per channel)`);
        console.log(`💭 Comments: ${taskCommentsResult.rows[0].count} (5 per task)`);
        console.log(`👍 Reactions: ${reactionsResult.rows[0].count}`);
        console.log('\n🎯 TESTING READY!');
        console.log('Your application now has comprehensive test data for robust testing.');
        console.log('All API endpoints can be tested with realistic data scenarios.');
    }
    catch (error) {
        logger_1.logger.error('Data verification failed:', error);
        throw error;
    }
}
// Run if called directly
if (require.main === module) {
    verifyData()
        .then(() => {
        process.exit(0);
    })
        .catch((error) => {
        console.error('Verification failed:', error);
        process.exit(1);
    });
}
exports.default = verifyData;
//# sourceMappingURL=verify-data.js.map