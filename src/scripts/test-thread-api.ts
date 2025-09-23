import { query, initializeDatabase } from '../config/database';
import { logger } from '../utils/logger';

async function testThreadAPI() {
  try {
    await initializeDatabase();
    
    // Get a channel and message for testing
    const channelResult = await query('SELECT id FROM channels LIMIT 1');
    const threadResult = await query(`
      SELECT m.id, m.channel_id 
      FROM messages m 
      WHERE m.thread_root_id IS NOT NULL 
      LIMIT 1
    `);
    
    if (channelResult.rows.length === 0 || threadResult.rows.length === 0) {
      console.log('❌ No test data found');
      return;
    }
    
    const channelId = channelResult.rows[0].id;
    const threadReply = threadResult.rows[0];
    
    console.log('🧪 TESTING THREAD API');
    console.log('==================');
    console.log(`Channel ID: ${channelId}`);
    console.log(`Thread Reply ID: ${threadReply.id}`);
    console.log(`Thread Reply Channel: ${threadReply.channel_id}`);
    
    // Get the thread root ID for this reply
    const rootResult = await query(`
      SELECT m.thread_root_id, root.content as root_content
      FROM messages m
      LEFT JOIN messages root ON m.thread_root_id = root.id
      WHERE m.id = $1
    `, [threadReply.id]);
    
    const threadRootId = rootResult.rows[0].thread_root_id;
    const rootContent = rootResult.rows[0].root_content;
    
    console.log(`Thread Root ID: ${threadRootId}`);
    console.log(`Root Content: ${rootContent?.substring(0, 50)}...`);
    
    // Now test what the ThreadRepository.getThreadReplies would return
    const repliesResult = await query(`
      SELECT 
        m.id,
        m.content,
        m.user_id,
        m.thread_root_id,
        m.reply_to_id,
        m.message_type,
        m.created_at,
        u.name as author_name
      FROM messages m
      JOIN users u ON m.user_id = u.id
      WHERE m.thread_root_id = $1 AND m.deleted_at IS NULL
      ORDER BY m.created_at ASC
    `, [threadRootId]);
    
    console.log(`\n🔍 THREAD REPLIES QUERY RESULT:`);
    console.log(`Found ${repliesResult.rows.length} replies for thread root ${threadRootId}:`);
    
    for (const reply of repliesResult.rows) {
      console.log(`  - [${reply.id}] ${reply.content.substring(0, 40)}... (by ${reply.author_name})`);
      console.log(`    Created: ${reply.created_at}`);
    }
    
    // Test the API URL that would be called
    console.log(`\n🌐 API ENDPOINT TO TEST:`);
    console.log(`GET /api/channels/${channelId}/messages/${threadRootId}/thread`);
    
  } catch (error) {
    logger.error('Thread API test failed:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  testThreadAPI()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('Thread API test failed:', error);
      process.exit(1);
    });
}

export default testThreadAPI;