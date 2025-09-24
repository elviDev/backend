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
exports.fixOrphanedTasks = fixOrphanedTasks;
const index_1 = require("@db/index");
const logger_1 = require("@utils/logger");
/**
 * Fix existing tasks without channels by assigning them to a default channel
 */
async function fixOrphanedTasks() {
    try {
        logger_1.logger.info('🔧 Fixing tasks without channel assignments...');
        // Get all tasks without channels
        const allTasksResult = await index_1.taskRepository.findMany({ limit: 1000, offset: 0 });
        const allTasks = allTasksResult.data;
        const orphanedTasks = allTasks.filter(task => !task.channel_id);
        if (orphanedTasks.length === 0) {
            logger_1.logger.info('✅ No orphaned tasks found. All tasks have proper channel assignments.');
            return;
        }
        logger_1.logger.info(`🔍 Found ${orphanedTasks.length} orphaned tasks without channel assignments`);
        // Find an existing channel for orphaned tasks - we'll use the first available channel
        const channelsResult = await index_1.channelRepository.findMany({ limit: 10, offset: 0 });
        const channels = channelsResult.data;
        if (channels.length === 0) {
            logger_1.logger.error('❌ No channels found. Cannot fix orphaned tasks without at least one channel.');
            return;
        }
        // Use the first available channel (which we know exists from our earlier data creation)
        const defaultChannel = channels[0];
        const defaultChannelId = defaultChannel.id;
        logger_1.logger.info(`📁 Using existing channel for orphaned tasks: ${defaultChannel.name}`);
        // Fix each orphaned task
        let fixedCount = 0;
        for (const task of orphanedTasks) {
            try {
                await index_1.taskRepository.update(task.id, {
                    channel_id: defaultChannelId
                });
                fixedCount++;
                logger_1.logger.info(`🔧 Fixed task: ${task.title} (ID: ${task.id})`);
            }
            catch (error) {
                logger_1.logger.error(`❌ Failed to fix task ${task.id}:`, error);
            }
        }
        logger_1.logger.info('✅ Orphaned task fix completed!');
        logger_1.logger.info(`📊 Summary:`);
        logger_1.logger.info(`  - Found ${orphanedTasks.length} orphaned tasks`);
        logger_1.logger.info(`  - Successfully fixed ${fixedCount} tasks`);
        logger_1.logger.info(`  - All tasks now belong to channels`);
    }
    catch (error) {
        logger_1.logger.error('❌ Orphaned task fix failed:', error);
        throw error;
    }
}
// Run the fix if this file is executed directly
if (require.main === module) {
    Promise.resolve().then(() => __importStar(require('@config/index'))).then(async () => {
        const { initializeDatabase } = await Promise.resolve().then(() => __importStar(require('@config/database')));
        await initializeDatabase();
        fixOrphanedTasks().then(() => {
            process.exit(0);
        }).catch((error) => {
            console.error('Fix failed:', error);
            process.exit(1);
        });
    });
}
//# sourceMappingURL=fix-orphaned-tasks.js.map