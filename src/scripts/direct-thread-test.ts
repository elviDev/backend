import { query, initializeDatabase } from '../config/database';
import { logger } from '../utils/logger';
import ThreadRepository from '../db/ThreadRepository';
import MessageRepository from '../db/MessageRepository';

async function directThreadTest() {
  try {
    await initializeDatabase();
    
    const threadRepository = new ThreadRepository();
    const messageRepository = new MessageRepository();
    
    console.log('🧪 DIRECT THREAD REPOSITORY TEST');
    console.log('=================================');
    
    // Get a known thread root ID
    const threadRootId = 'aa94e92c-f9c7-4ed2-af33-7375ca46de3f';
    
    console.log(`Testing thread root ID: ${threadRootId}`);
    
    // First check if the message exists and is a thread root
    const rootMessage = await messageRepository.findById(threadRootId);
    console.log(`\n📋 ROOT MESSAGE:`);
    console.log(`  Exists: ${rootMessage ? 'YES' : 'NO'}`);
    if (rootMessage) {
      console.log(`  Content: ${rootMessage.content.substring(0, 50)}...`);
      console.log(`  Is Thread Root: ${rootMessage.is_thread_root}`);
      console.log(`  Thread Root ID: ${rootMessage.thread_root_id}`);
    }
    
    // Test ThreadRepository.getThreadReplies directly
    console.log(`\n🧵 TESTING ThreadRepository.getThreadReplies():`);
    try {
      const { replies, total } = await threadRepository.getThreadReplies(threadRootId, 50, 0);
      console.log(`  Total replies found: ${total}`);
      console.log(`  Replies returned: ${replies.length}`);
      
      for (const reply of replies) {
        console.log(`    - [${reply.id}] ${reply.content.substring(0, 40)}...`);
        console.log(`      Author: ${reply.user_details.name}`);
        console.log(`      Thread Root: ${reply.thread_root_id}`);
      }
    } catch (error) {
      console.log(`  ❌ Error: ${error.message}`);
    }
    
    // Also test the raw query that should be equivalent
    console.log(`\n🔍 RAW SQL QUERY TEST:`);
    const rawResult = await query(`
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
      LEFT JOIN users u ON m.user_id = u.id
      WHERE m.thread_root_id = $1 AND m.deleted_at IS NULL
      ORDER BY m.created_at ASC
    `, [threadRootId]);
    
    console.log(`  Raw query found: ${rawResult.rows.length} replies`);
    for (const reply of rawResult.rows) {
      console.log(`    - [${reply.id}] ${reply.content.substring(0, 40)}...`);
      console.log(`      Author: ${reply.author_name}`);
    }
    
    // Check for potential issues
    console.log(`\n🔍 DIAGNOSTIC CHECKS:`);
    
    // Check if thread_statistics table exists and has entry
    const statsResult = await query(`
      SELECT * FROM thread_statistics WHERE thread_root_id = $1
    `, [threadRootId]);
    console.log(`  Thread statistics exist: ${statsResult.rows.length > 0 ? 'YES' : 'NO'}`);
    if (statsResult.rows.length > 0) {
      console.log(`  Reply count in stats: ${statsResult.rows[0].reply_count}`);
    }
    
    // Check if there are any messages with this thread_root_id that might be marked as deleted
    const allThreadMessages = await query(`
      SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE deleted_at IS NULL) as active
      FROM messages WHERE thread_root_id = $1
    `, [threadRootId]);
    console.log(`  Total thread messages: ${allThreadMessages.rows[0].total}`);
    console.log(`  Active thread messages: ${allThreadMessages.rows[0].active}`);
    
  } catch (error) {
    logger.error('Direct thread test failed:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  directThreadTest()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('Direct thread test failed:', error);
      process.exit(1);
    });
}

export default directThreadTest;