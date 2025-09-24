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
exports.runDiagnostics = runDiagnostics;
const index_1 = require("@db/index");
const logger_1 = require("@utils/logger");
/**
 * API Diagnostics - Check what data is available for frontend
 */
async function runDiagnostics() {
    try {
        logger_1.logger.info('🔍 Running API diagnostics...');
        // Check database connection
        logger_1.logger.info('📊 Database Status:');
        // Count users
        const usersResult = await index_1.userRepository.findMany({ limit: 100, offset: 0 });
        const users = usersResult.data;
        logger_1.logger.info(`  - Users: ${users.length}`);
        // Count channels
        const channelsResult = await index_1.channelRepository.findMany({ limit: 100, offset: 0 });
        const channels = channelsResult.data;
        logger_1.logger.info(`  - Channels: ${channels.length}`);
        // Count tasks
        const tasksResult = await index_1.taskRepository.findMany({ limit: 100, offset: 0 });
        const tasks = tasksResult.data;
        logger_1.logger.info(`  - Tasks: ${tasks.length}`);
        // Show sample data for verification
        logger_1.logger.info('📋 Sample Channels:');
        channels.slice(0, 3).forEach(channel => {
            logger_1.logger.info(`  - ${channel.name} (ID: ${channel.id})`);
        });
        logger_1.logger.info('📋 Sample Tasks:');
        tasks.slice(0, 3).forEach(task => {
            logger_1.logger.info(`  - ${task.title} (Channel: ${task.channel_id})`);
        });
        // Check server configuration
        logger_1.logger.info('⚙️ Server Configuration:');
        logger_1.logger.info(`  - NODE_ENV: ${process.env.NODE_ENV}`);
        logger_1.logger.info(`  - PORT: ${process.env.PORT}`);
        logger_1.logger.info(`  - HOST: ${process.env.HOST}`);
        logger_1.logger.info(`  - API_PREFIX: ${process.env.API_PREFIX}`);
        logger_1.logger.info(`  - API_VERSION: ${process.env.API_VERSION}`);
        logger_1.logger.info(`  - CORS_ORIGIN: ${process.env.CORS_ORIGIN}`);
        // Expected API endpoints
        const baseUrl = `http://${process.env.HOST || 'localhost'}:${process.env.PORT || 3000}${process.env.API_PREFIX || '/api'}/${process.env.API_VERSION || 'v1'}`;
        logger_1.logger.info('🌐 Expected API Endpoints:');
        logger_1.logger.info(`  - Base URL: ${baseUrl}`);
        logger_1.logger.info(`  - Channels: GET ${baseUrl}/channels`);
        logger_1.logger.info(`  - Tasks: GET ${baseUrl}/tasks`);
        logger_1.logger.info(`  - Users: GET ${baseUrl}/users`);
        logger_1.logger.info('✅ Diagnostics completed successfully!');
        return {
            users: users.length,
            channels: channels.length,
            tasks: tasks.length,
            baseUrl,
            sampleChannels: channels.slice(0, 3).map(c => ({ id: c.id, name: c.name })),
            sampleTasks: tasks.slice(0, 3).map(t => ({ id: t.id, title: t.title, channel_id: t.channel_id }))
        };
    }
    catch (error) {
        logger_1.logger.error('❌ Diagnostics failed:', error);
        throw error;
    }
}
// Run diagnostics if this file is executed directly
if (require.main === module) {
    Promise.resolve().then(() => __importStar(require('@config/index'))).then(async () => {
        const { initializeDatabase } = await Promise.resolve().then(() => __importStar(require('@config/database')));
        await initializeDatabase();
        runDiagnostics().then((result) => {
            console.log('\n📊 DIAGNOSTICS SUMMARY:');
            console.log(`Users: ${result.users}`);
            console.log(`Channels: ${result.channels}`);
            console.log(`Tasks: ${result.tasks}`);
            console.log(`API Base: ${result.baseUrl}`);
            process.exit(0);
        }).catch((error) => {
            console.error('Diagnostics failed:', error);
            process.exit(1);
        });
    });
}
//# sourceMappingURL=api-diagnostics.js.map