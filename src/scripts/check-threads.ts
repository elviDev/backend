import { query, initializeDatabase } from '../config/database';
import { logger } from '../utils/logger';

async function checkThreads() {
  try {
    await initializeDatabase();
    
    console.log('🧵 THREAD STRUCTURE ANALYSIS');
    console.log('=============================');
    
    // Check all messages with their thread relationships
    const messagesResult = await query(`
      SELECT 
        m.id,
        m.content,
        m.reply_to_id,
        m.thread_root_id,
        u.name as author_name,
        c.name as channel_name,
        CASE 
          WHEN m.reply_to_id IS NULL THEN 'ORIGINAL'
          WHEN m.thread_root_id IS NOT NULL THEN 'THREAD_REPLY'
          ELSE 'DIRECT_REPLY'
        END as message_type
      FROM messages m
      JOIN users u ON m.user_id = u.id
      JOIN channels c ON m.channel_id = c.id
      WHERE m.deleted_at IS NULL
      ORDER BY c.name, m.created_at
    `);
    
    console.log('\n📋 ALL MESSAGES BY CHANNEL:');
    console.log('==========================================');
    
    let currentChannel = '';
    let threadMessages = new Map();
    
    for (const msg of messagesResult.rows) {
      if (msg.channel_name !== currentChannel) {
        currentChannel = msg.channel_name;
        console.log(`\n📂 CHANNEL: ${currentChannel}`);
        console.log('----------------------------------------');
      }
      
      const indent = msg.message_type === 'THREAD_REPLY' ? '    ' : '  ';
      const typeIcon = msg.message_type === 'ORIGINAL' ? '💬' : 
                      msg.message_type === 'THREAD_REPLY' ? '🧵' : '↩️';
      
      console.log(`${indent}${typeIcon} [${msg.message_type}] ${msg.content.substring(0, 50)}...`);
      console.log(`${indent}   Author: ${msg.author_name}`);
      console.log(`${indent}   ID: ${msg.id}`);
      
      if (msg.reply_to_id) {
        console.log(`${indent}   Reply to: ${msg.reply_to_id}`);
      }
      if (msg.thread_root_id) {
        console.log(`${indent}   Thread root: ${msg.thread_root_id}`);
      }
      console.log('');
      
      // Track thread relationships
      if (msg.thread_root_id) {
        if (!threadMessages.has(msg.thread_root_id)) {
          threadMessages.set(msg.thread_root_id, []);
        }
        threadMessages.get(msg.thread_root_id).push(msg);
      }
    }
    
    // Analyze thread structures
    console.log('\n🔍 THREAD ANALYSIS:');
    console.log('===================');
    
    if (threadMessages.size === 0) {
      console.log('❌ No threaded messages found!');
    } else {
      for (const [rootId, replies] of threadMessages.entries()) {
        const rootMsg = messagesResult.rows.find(m => m.id === rootId);
        console.log(`\n🧵 THREAD ROOT: ${rootMsg ? rootMsg.content.substring(0, 40) + '...' : 'Unknown'}`);
        console.log(`   Root ID: ${rootId}`);
        console.log(`   Replies: ${replies.length}`);
        
        for (const reply of replies) {
          console.log(`     - ${reply.content.substring(0, 30)}... (by ${reply.author_name})`);
        }
      }
    }
    
    // Check specific thread API response
    const firstThread = Array.from(threadMessages.keys())[0];
    if (firstThread) {
      console.log('\n🔬 TESTING THREAD API RESPONSE:');
      console.log('==============================');
      
      const threadReplies = await query(`
        SELECT 
          m.id,
          m.content,
          m.reply_to_id,
          m.thread_root_id,
          u.name as author_name,
          m.created_at
        FROM messages m
        JOIN users u ON m.user_id = u.id
        WHERE m.thread_root_id = $1 AND m.deleted_at IS NULL
        ORDER BY m.created_at ASC
      `, [firstThread]);
      
      console.log(`Thread Root ID: ${firstThread}`);
      console.log(`Found ${threadReplies.rows.length} replies:`);
      
      for (const reply of threadReplies.rows) {
        console.log(`  - ${reply.content} (by ${reply.author_name})`);
        console.log(`    ID: ${reply.id}`);
        console.log(`    Created: ${reply.created_at}`);
      }
    }
    
  } catch (error) {
    logger.error('Thread check failed:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  checkThreads()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('Thread check failed:', error);
      process.exit(1);
    });
}

export default checkThreads;