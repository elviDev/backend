#!/usr/bin/env tsx

import { channelRepository, messageRepository, userRepository } from '@db/index';
import { logger } from '@utils/logger';

/**
 * Check channels for messages and member data
 */

async function checkChannelData() {
  try {
    logger.info('🔍 Checking channel data (messages, users, members)...');

    // Get all channels
    const channelsResult = await channelRepository.findMany({ limit: 100, offset: 0 });
    const channels = channelsResult.data;

    logger.info(`📁 Found ${channels.length} channels`);

    // Check each channel for messages and members
    for (const channel of channels) {
      logger.info(`\n📁 Channel: ${channel.name} (ID: ${channel.id})`);

      // Check channel members
      const memberCount = channel.members ? channel.members.length : 0;
      logger.info(`  👥 Members: ${memberCount}`);

      if (memberCount > 0 && channel.members) {
        // Get member details
        const memberDetails = [];
        for (const memberId of channel.members.slice(0, 3)) { // Show first 3 members
          try {
            const user = await userRepository.findById(memberId);
            if (user) {
              memberDetails.push(`${user.name} (${user.role})`);
            }
          } catch (error) {
            memberDetails.push(`Unknown user (${memberId})`);
          }
        }
        logger.info(`  👤 Sample members: ${memberDetails.join(', ')}${memberCount > 3 ? '...' : ''}`);
      }

      // Check messages in this channel
      try {
        const messagesResult = await messageRepository.findMany({
          limit: 100,
          offset: 0,
          filters: { channel_id: channel.id }
        });
        const messages = messagesResult.data;

        logger.info(`  💬 Messages: ${messages.length}`);

        if (messages.length > 0) {
          // Show recent messages
          const recentMessages = messages.slice(0, 3);
          for (const message of recentMessages) {
            const preview = message.content.length > 50
              ? message.content.substring(0, 50) + '...'
              : message.content;
            logger.info(`    - "${preview}" (${message.created_at})`);
          }
        } else {
          logger.warn(`    ⚠️ No messages found in channel`);
        }
      } catch (error) {
        logger.error(`    ❌ Error checking messages: ${error}`);
      }
    }

    // Summary
    const totalMessages = await messageRepository.findMany({ limit: 10000, offset: 0 });
    const channelsWithMessages = [];
    const channelsWithoutMessages = [];

    for (const channel of channels) {
      try {
        const channelMessages = await messageRepository.findMany({
          limit: 1,
          offset: 0,
          filters: { channel_id: channel.id }
        });

        if (channelMessages.data.length > 0) {
          channelsWithMessages.push(channel.name);
        } else {
          channelsWithoutMessages.push(channel.name);
        }
      } catch (error) {
        channelsWithoutMessages.push(channel.name);
      }
    }

    logger.info(`\n📊 Summary:`);
    logger.info(`  - Total channels: ${channels.length}`);
    logger.info(`  - Total messages: ${totalMessages.data.length}`);
    logger.info(`  - Channels with messages: ${channelsWithMessages.length}`);
    logger.info(`  - Channels without messages: ${channelsWithoutMessages.length}`);

    if (channelsWithoutMessages.length > 0) {
      logger.warn(`  ⚠️ Channels without messages: ${channelsWithoutMessages.join(', ')}`);
    }

    return {
      totalChannels: channels.length,
      totalMessages: totalMessages.data.length,
      channelsWithMessages: channelsWithMessages.length,
      channelsWithoutMessages: channelsWithoutMessages.length,
      channels: channels.map(c => ({
        id: c.id,
        name: c.name,
        memberCount: c.members ? c.members.length : 0,
        members: c.members || []
      }))
    };

  } catch (error) {
    logger.error('❌ Failed to check channel data:', error);
    throw error;
  }
}

// Run the check if this file is executed directly
if (require.main === module) {
  import('@config/index').then(async () => {
    const { initializeDatabase } = await import('@config/database');
    await initializeDatabase();

    checkChannelData().then((result) => {
      console.log(`\n📊 CHANNEL DATA SUMMARY:`);
      console.log(`Total Channels: ${result.totalChannels}`);
      console.log(`Total Messages: ${result.totalMessages}`);
      console.log(`Channels with Messages: ${result.channelsWithMessages}`);
      console.log(`Channels without Messages: ${result.channelsWithoutMessages}`);
      process.exit(0);
    }).catch((error) => {
      console.error('Check failed:', error);
      process.exit(1);
    });
  });
}

export { checkChannelData };