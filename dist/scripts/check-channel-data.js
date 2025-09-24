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
exports.checkChannelData = checkChannelData;
const index_1 = require("@db/index");
const logger_1 = require("@utils/logger");
/**
 * Check channels for messages and member data
 */
async function checkChannelData() {
    try {
        logger_1.logger.info('🔍 Checking channel data (messages, users, members)...');
        // Get all channels
        const channelsResult = await index_1.channelRepository.findMany({ limit: 100, offset: 0 });
        const channels = channelsResult.data;
        logger_1.logger.info(`📁 Found ${channels.length} channels`);
        // Check each channel for messages and members
        for (const channel of channels) {
            logger_1.logger.info(`\n📁 Channel: ${channel.name} (ID: ${channel.id})`);
            // Check channel members
            const memberCount = channel.members ? channel.members.length : 0;
            logger_1.logger.info(`  👥 Members: ${memberCount}`);
            if (memberCount > 0 && channel.members) {
                // Get member details
                const memberDetails = [];
                for (const memberId of channel.members.slice(0, 3)) { // Show first 3 members
                    try {
                        const user = await index_1.userRepository.findById(memberId);
                        if (user) {
                            memberDetails.push(`${user.name} (${user.role})`);
                        }
                    }
                    catch (error) {
                        memberDetails.push(`Unknown user (${memberId})`);
                    }
                }
                logger_1.logger.info(`  👤 Sample members: ${memberDetails.join(', ')}${memberCount > 3 ? '...' : ''}`);
            }
            // Check messages in this channel
            try {
                const messagesResult = await index_1.messageRepository.findMany({
                    limit: 100,
                    offset: 0,
                    filters: { channel_id: channel.id }
                });
                const messages = messagesResult.data;
                logger_1.logger.info(`  💬 Messages: ${messages.length}`);
                if (messages.length > 0) {
                    // Show recent messages
                    const recentMessages = messages.slice(0, 3);
                    for (const message of recentMessages) {
                        const preview = message.content.length > 50
                            ? message.content.substring(0, 50) + '...'
                            : message.content;
                        logger_1.logger.info(`    - "${preview}" (${message.created_at})`);
                    }
                }
                else {
                    logger_1.logger.warn(`    ⚠️ No messages found in channel`);
                }
            }
            catch (error) {
                logger_1.logger.error(`    ❌ Error checking messages: ${error}`);
            }
        }
        // Summary
        const totalMessages = await index_1.messageRepository.findMany({ limit: 10000, offset: 0 });
        const channelsWithMessages = [];
        const channelsWithoutMessages = [];
        for (const channel of channels) {
            try {
                const channelMessages = await index_1.messageRepository.findMany({
                    limit: 1,
                    offset: 0,
                    filters: { channel_id: channel.id }
                });
                if (channelMessages.data.length > 0) {
                    channelsWithMessages.push(channel.name);
                }
                else {
                    channelsWithoutMessages.push(channel.name);
                }
            }
            catch (error) {
                channelsWithoutMessages.push(channel.name);
            }
        }
        logger_1.logger.info(`\n📊 Summary:`);
        logger_1.logger.info(`  - Total channels: ${channels.length}`);
        logger_1.logger.info(`  - Total messages: ${totalMessages.data.length}`);
        logger_1.logger.info(`  - Channels with messages: ${channelsWithMessages.length}`);
        logger_1.logger.info(`  - Channels without messages: ${channelsWithoutMessages.length}`);
        if (channelsWithoutMessages.length > 0) {
            logger_1.logger.warn(`  ⚠️ Channels without messages: ${channelsWithoutMessages.join(', ')}`);
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
    }
    catch (error) {
        logger_1.logger.error('❌ Failed to check channel data:', error);
        throw error;
    }
}
// Run the check if this file is executed directly
if (require.main === module) {
    Promise.resolve().then(() => __importStar(require('@config/index'))).then(async () => {
        const { initializeDatabase } = await Promise.resolve().then(() => __importStar(require('@config/database')));
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
//# sourceMappingURL=check-channel-data.js.map