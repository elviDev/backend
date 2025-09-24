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
exports.countTasks = countTasks;
const index_1 = require("@db/index");
const logger_1 = require("@utils/logger");
/**
 * Count total tasks in the database
 */
async function countTasks() {
    try {
        logger_1.logger.info('📊 Counting total tasks in database...');
        // Get all tasks with a high limit to ensure we get everything
        const tasksResult = await index_1.taskRepository.findMany({ limit: 10000, offset: 0 });
        const tasks = tasksResult.data;
        const totalFromQuery = tasks.length;
        // Also check the total count from the pagination result
        const totalFromPagination = tasksResult.total;
        logger_1.logger.info(`📈 Task Count Results:`);
        logger_1.logger.info(`  - Tasks retrieved: ${totalFromQuery}`);
        logger_1.logger.info(`  - Total from pagination: ${totalFromPagination}`);
        logger_1.logger.info(`  - Has more pages: ${tasksResult.hasMore}`);
        // Breakdown by status
        const statusCounts = tasks.reduce((acc, task) => {
            acc[task.status] = (acc[task.status] || 0) + 1;
            return acc;
        }, {});
        logger_1.logger.info(`📋 Tasks by Status:`);
        Object.entries(statusCounts).forEach(([status, count]) => {
            logger_1.logger.info(`  - ${status}: ${count}`);
        });
        // Breakdown by channel
        const channelCounts = tasks.reduce((acc, task) => {
            const channelId = task.channel_id || 'NO_CHANNEL';
            acc[channelId] = (acc[channelId] || 0) + 1;
            return acc;
        }, {});
        logger_1.logger.info(`📁 Tasks by Channel:`);
        Object.entries(channelCounts).forEach(([channelId, count]) => {
            logger_1.logger.info(`  - ${channelId === 'NO_CHANNEL' ? 'NO CHANNEL' : channelId}: ${count}`);
        });
        // Check for tasks without channels
        const tasksWithoutChannels = tasks.filter(task => !task.channel_id);
        if (tasksWithoutChannels.length > 0) {
            logger_1.logger.warn(`⚠️ Found ${tasksWithoutChannels.length} tasks without channels!`);
        }
        else {
            logger_1.logger.info(`✅ All tasks have proper channel assignments`);
        }
        return {
            total: totalFromPagination,
            retrieved: totalFromQuery,
            hasMore: tasksResult.hasMore,
            statusBreakdown: statusCounts,
            channelBreakdown: channelCounts,
            orphanedTasks: tasksWithoutChannels.length
        };
    }
    catch (error) {
        logger_1.logger.error('❌ Failed to count tasks:', error);
        throw error;
    }
}
// Run the count if this file is executed directly
if (require.main === module) {
    Promise.resolve().then(() => __importStar(require('@config/index'))).then(async () => {
        const { initializeDatabase } = await Promise.resolve().then(() => __importStar(require('@config/database')));
        await initializeDatabase();
        countTasks().then((result) => {
            console.log(`\n📊 TOTAL TASKS: ${result.total}`);
            process.exit(0);
        }).catch((error) => {
            console.error('Count failed:', error);
            process.exit(1);
        });
    });
}
//# sourceMappingURL=count-tasks.js.map