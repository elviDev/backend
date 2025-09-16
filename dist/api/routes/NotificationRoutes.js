"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationRoutes = notificationRoutes;
const typebox_1 = require("@sinclair/typebox");
const index_1 = require("@db/index");
const logger_1 = require("@utils/logger");
const errors_1 = require("@utils/errors");
const utils_1 = require("@websocket/utils");
// Schema definitions
const ChannelNotificationSchema = typebox_1.Type.Object({
    channelId: typebox_1.Type.String(),
    senderId: typebox_1.Type.String(),
    senderName: typebox_1.Type.String(),
    message: typebox_1.Type.String(),
    type: typebox_1.Type.Union([typebox_1.Type.Literal('new_message'), typebox_1.Type.Literal('thread_reply')]),
    parentMessageId: typebox_1.Type.Optional(typebox_1.Type.String()),
});
async function notificationRoutes(fastify) {
    /**
     * POST /notifications/channel - Send push notifications to channel members
     */
    fastify.post('/notifications/channel', {
        preHandler: [fastify.authenticate],
        schema: {
            tags: ['Notifications'],
            summary: 'Send Channel Notification',
            description: 'Send push notifications to all channel members except the sender',
            body: ChannelNotificationSchema,
            response: {
                200: typebox_1.Type.Object({
                    success: typebox_1.Type.Boolean(),
                    message: typebox_1.Type.String(),
                    notificationsSent: typebox_1.Type.Number(),
                }),
                400: typebox_1.Type.Object({
                    error: typebox_1.Type.Object({
                        message: typebox_1.Type.String(),
                        code: typebox_1.Type.String(),
                    }),
                }),
                500: typebox_1.Type.Object({
                    error: typebox_1.Type.Object({
                        message: typebox_1.Type.String(),
                        code: typebox_1.Type.String(),
                    }),
                }),
            },
        },
    }, async (request, reply) => {
        const { channelId, senderId, senderName, message, type, parentMessageId } = request.body;
        const context = (0, errors_1.createErrorContext)({
            ...(request.user && {
                user: {
                    id: request.user.userId,
                    email: request.user.email ?? '',
                    role: request.user.role,
                },
            }),
            ip: request.ip,
            method: request.method,
            url: request.url,
            headers: request.headers,
        });
        try {
            logger_1.loggers.api.info({
                userId: request.user?.userId,
                channelId,
                type,
                messageLength: message.length,
            }, 'Sending channel notification');
            // Get channel members (excluding the sender)
            const members = await index_1.channelRepository.getMembers(channelId);
            const recipientMembers = members.filter(member => member.user_id !== senderId);
            if (recipientMembers.length === 0) {
                return reply.send({
                    success: true,
                    message: 'No recipients to notify',
                    notificationsSent: 0,
                });
            }
            // Prepare notification data
            const notificationTitle = type === 'thread_reply'
                ? `${senderName} replied in thread`
                : `New message in channel`;
            const notificationBody = message.length > 100
                ? `${message.substring(0, 97)}...`
                : message;
            // Send notifications via WebSocket (which can trigger push notifications)
            let notificationsSent = 0;
            for (const member of recipientMembers) {
                try {
                    // Send WebSocket notification
                    await utils_1.WebSocketUtils.createAndSendNotification(member.user_id, {
                        title: notificationTitle,
                        message: notificationBody,
                        category: 'channel',
                        priority: 'medium',
                        data: {
                            channelId,
                            senderId,
                            senderName,
                            messageId: parentMessageId || 'new',
                            type,
                        },
                    });
                    notificationsSent++;
                }
                catch (error) {
                    logger_1.loggers.api.warn({ error, userId: member.user_id, channelId }, 'Failed to send notification to user');
                }
            }
            logger_1.loggers.api.info({
                userId: request.user?.userId,
                channelId,
                type,
                notificationsSent,
                totalRecipients: recipientMembers.length,
            }, 'Channel notifications sent successfully');
            reply.send({
                success: true,
                message: 'Notifications sent successfully',
                notificationsSent,
            });
        }
        catch (error) {
            logger_1.loggers.api.error({ error, context }, 'Failed to send channel notifications');
            const notificationError = new errors_1.ExternalServiceError('Failed to send notifications', 'notification-service', error);
            reply.code(502).send((0, errors_1.formatErrorResponse)(notificationError));
        }
    });
    /**
     * POST /notifications/register - Register device token for push notifications
     */
    fastify.post('/notifications/register', {
        preHandler: [fastify.authenticate],
        schema: {
            tags: ['Notifications'],
            summary: 'Register Device Token',
            description: 'Register device token for push notifications',
            body: typebox_1.Type.Object({
                token: typebox_1.Type.String(),
                platform: typebox_1.Type.Union([typebox_1.Type.Literal('ios'), typebox_1.Type.Literal('android')]),
                deviceInfo: typebox_1.Type.Optional(typebox_1.Type.Object({
                    brand: typebox_1.Type.Optional(typebox_1.Type.String()),
                    modelName: typebox_1.Type.Optional(typebox_1.Type.String()),
                    osName: typebox_1.Type.Optional(typebox_1.Type.String()),
                    osVersion: typebox_1.Type.Optional(typebox_1.Type.String()),
                })),
            }),
            response: {
                200: typebox_1.Type.Object({
                    success: typebox_1.Type.Boolean(),
                    message: typebox_1.Type.String(),
                }),
            },
        },
    }, async (request, reply) => {
        const { token, platform, deviceInfo } = request.body;
        try {
            logger_1.loggers.api.info({
                userId: request.user?.userId,
                platform,
                deviceInfo,
            }, 'Registering device token');
            // Here you would typically save the token to your database
            // associated with the user for later use in push notifications
            // For now, just log it as this would require a device_tokens table
            logger_1.loggers.api.info({
                userId: request.user?.userId,
                tokenLength: token.length,
                platform,
            }, 'Device token registered (not persisted - requires device_tokens table)');
            reply.send({
                success: true,
                message: 'Device token registered successfully',
            });
        }
        catch (error) {
            logger_1.loggers.api.error({ error, userId: request.user?.userId }, 'Failed to register device token');
            const tokenError = new errors_1.ExternalServiceError('Failed to register device token', 'notification-service', error);
            reply.code(502).send((0, errors_1.formatErrorResponse)(tokenError));
        }
    });
    /**
     * PUT /notifications/preferences - Update notification preferences
     */
    fastify.put('/notifications/preferences', {
        preHandler: [fastify.authenticate],
        schema: {
            tags: ['Notifications'],
            summary: 'Update Notification Preferences',
            description: 'Update user notification preferences',
            body: typebox_1.Type.Object({
                taskNotifications: typebox_1.Type.Boolean(),
                mentionNotifications: typebox_1.Type.Boolean(),
                channelNotifications: typebox_1.Type.Boolean(),
                quietHoursEnabled: typebox_1.Type.Boolean(),
                quietHoursStart: typebox_1.Type.Optional(typebox_1.Type.String()),
                quietHoursEnd: typebox_1.Type.Optional(typebox_1.Type.String()),
            }),
            response: {
                200: typebox_1.Type.Object({
                    success: typebox_1.Type.Boolean(),
                    message: typebox_1.Type.String(),
                }),
            },
        },
    }, async (request, reply) => {
        try {
            logger_1.loggers.api.info({
                userId: request.user?.userId,
                preferences: request.body,
            }, 'Updating notification preferences');
            // Here you would update the user's notification preferences in the database
            // This would require a user_notification_preferences table or additional columns
            reply.send({
                success: true,
                message: 'Notification preferences updated successfully',
            });
        }
        catch (error) {
            logger_1.loggers.api.error({ error, userId: request.user?.userId }, 'Failed to update notification preferences');
            const prefsError = new errors_1.ExternalServiceError('Failed to update notification preferences', 'preferences-service', error);
            reply.code(502).send((0, errors_1.formatErrorResponse)(prefsError));
        }
    });
    /**
     * GET /notifications/preferences - Get notification preferences
     */
    fastify.get('/notifications/preferences', {
        preHandler: [fastify.authenticate],
        schema: {
            tags: ['Notifications'],
            summary: 'Get Notification Preferences',
            description: 'Get user notification preferences',
            response: {
                200: typebox_1.Type.Object({
                    success: typebox_1.Type.Boolean(),
                    data: typebox_1.Type.Object({
                        taskNotifications: typebox_1.Type.Boolean(),
                        mentionNotifications: typebox_1.Type.Boolean(),
                        channelNotifications: typebox_1.Type.Boolean(),
                        quietHoursEnabled: typebox_1.Type.Boolean(),
                        quietHoursStart: typebox_1.Type.Optional(typebox_1.Type.String()),
                        quietHoursEnd: typebox_1.Type.Optional(typebox_1.Type.String()),
                    }),
                }),
            },
        },
    }, async (request, reply) => {
        try {
            // Return default preferences for now
            // In a real implementation, you'd fetch these from the database
            const defaultPreferences = {
                taskNotifications: true,
                mentionNotifications: true,
                channelNotifications: true,
                quietHoursEnabled: false,
                quietHoursStart: '22:00',
                quietHoursEnd: '08:00',
            };
            reply.send({
                success: true,
                data: defaultPreferences,
            });
        }
        catch (error) {
            logger_1.loggers.api.error({ error, userId: request.user?.userId }, 'Failed to get notification preferences');
            const getPrefsError = new errors_1.ExternalServiceError('Failed to get notification preferences', 'preferences-service', error);
            reply.code(502).send((0, errors_1.formatErrorResponse)(getPrefsError));
        }
    });
}
//# sourceMappingURL=NotificationRoutes.js.map