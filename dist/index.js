#!/usr/bin/env node
"use strict";
/**
 * CEO Communication Platform - Main Entry Point
 * High-performance backend API server with comprehensive features
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.server = void 0;
const index_1 = require("@config/index");
const logger_1 = require("@utils/logger");
const server_1 = require("./server");
Object.defineProperty(exports, "server", { enumerable: true, get: function () { return server_1.server; } });
/**
 * Main application entry point
 */
async function main() {
    try {
        // Log startup information
        logger_1.logger.info({
            nodeVersion: process.version,
            platform: process.platform,
            arch: process.arch,
            environment: index_1.config.app.env,
            pid: process.pid,
        }, 'Starting CEO Communication Platform API');
        // Validate configuration
        logger_1.logger.info('Validating configuration...');
        // Configuration is already validated in config/index.ts
        // Start the server
        await server_1.server.start();
    }
    catch (error) {
        logger_1.logger.fatal({ error }, 'Failed to start application');
        process.exit(1);
    }
}
// Handle top-level errors
process.on('uncaughtException', (error) => {
    logger_1.logger.fatal({ error }, 'Uncaught exception in main process');
    process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
    logger_1.logger.fatal({ reason, promise }, 'Unhandled promise rejection in main process');
    process.exit(1);
});
// Start the application
if (require.main === module) {
    main();
}
exports.default = main;
//# sourceMappingURL=index.js.map