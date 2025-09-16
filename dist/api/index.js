"use strict";
/**
 * API Routes Index
 * Centralized registration of all API endpoints
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerAPIRoutes = void 0;
const UserRoutes_1 = require("./routes/UserRoutes");
const ChannelRoutes_1 = require("./routes/ChannelRoutes");
const TaskRoutes_1 = require("./routes/TaskRoutes");
const DocsRoutes_1 = require("./routes/DocsRoutes");
const MessageRoutes_1 = require("./routes/MessageRoutes");
const ActivityRoutes_1 = require("./routes/ActivityRoutes");
const NotificationRoutes_1 = require("./routes/NotificationRoutes");
const AnnouncementRoutes_1 = require("./routes/AnnouncementRoutes");
const logger_1 = require("../utils/logger");
/**
 * Register all API routes
 */
const registerAPIRoutes = async (fastify) => {
    try {
        // Register route modules
        await fastify.register(UserRoutes_1.registerUserRoutes);
        await fastify.register(ChannelRoutes_1.registerChannelRoutes);
        await fastify.register(TaskRoutes_1.registerTaskRoutes);
        await fastify.register(MessageRoutes_1.registerMessageRoutes);
        await fastify.register(ActivityRoutes_1.registerActivityRoutes);
        await fastify.register(DocsRoutes_1.registerDocsRoutes);
        await fastify.register(NotificationRoutes_1.notificationRoutes);
        await fastify.register(AnnouncementRoutes_1.announcementRoutes);
        logger_1.logger.debug('All API routes registered');
    }
    catch (error) {
        console.error('API Registration Error Details:', error);
        logger_1.logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Failed to register API routes');
        throw error;
    }
};
exports.registerAPIRoutes = registerAPIRoutes;
exports.default = exports.registerAPIRoutes;
//# sourceMappingURL=index.js.map